const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Session, Message, Group, UploadedFile, DEFAULT_BIO } = require('../models');
const { hashToken, privateRoomId, groupRoomId } = require('../lib/chat-ids');

const MAX_TEXT_LENGTH = 10000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const rateBuckets = new Map();
const typingTimers = new Map();

const rateLimit = (key, limit, windowMs) => {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= limit;
};

const validId = (value) => mongoose.isValidObjectId(String(value || ''));
const validString = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const newToken = () => crypto.randomBytes(32).toString('base64url');

const userView = (user) => ({
  id: String(user._id),
  userId: String(user._id),
  username: user.username,
  avatar: user.avatar || '',
  bio: user.bio || DEFAULT_BIO,
  isOnline: !!user.isOnline
});

const groupView = (group) => ({
  ...group.toObject(),
  id: String(group._id),
  groupId: String(group._id),
  roomId: `group:${group._id}`,
  adminId: group.adminId ? String(group.adminId) : undefined,
  memberIds: (group.memberIds || []).map(String)
});

const safeAck = (callback, result) => {
  if (typeof callback === 'function') callback(result);
};

// Rule 11: Compute unread counts and last message previews for each user on refresh
const buildUserSummaries = async (userId, visibleGroups) => {
  const userObjId = new mongoose.Types.ObjectId(String(userId));
  const groupRooms = visibleGroups.map((g) => `group:${g._id}`);
  const dmRegex = new RegExp(`^dm:.*${String(userId)}.*$`);

  const latestMessages = await Message.aggregate([
    { $match: { $or: [{ room: { $in: groupRooms } }, { room: { $regex: dmRegex } }] } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: '$room', lastMessage: { $first: '$$ROOT' } } }
  ]);

  const unreadAgg = await Message.aggregate([
    { $match: { receiverId: userObjId, isRead: false } },
    { $group: { _id: '$room', count: { $sum: 1 } } }
  ]);

  const unreadMap = new Map(unreadAgg.map((u) => [u._id, u.count]));
  const summaries = {};
  for (const item of latestMessages) {
    summaries[item._id] = {
      lastMessage: item.lastMessage,
      unreadCount: unreadMap.get(item._id) || 0
    };
  }
  return summaries;
};

function setupSocketHandlers(io) {
  const sendDirectory = async () => {
    const [users, groups] = await Promise.all([
      User.find({}, 'username avatar bio isOnline').sort({ username: 1 }),
      Group.find({}).sort({ name: 1 })
    ]);
    const safeUsers = users.map(userView);
    for (const client of io.sockets.sockets.values()) {
      if (!client.data.userId) continue;
      const visibleGroups = groups.filter(
        (group) =>
          String(group.adminId || '') === String(client.data.userId) ||
          (group.memberIds || []).some((memberId) => String(memberId) === String(client.data.userId))
      );
      const summaries = await buildUserSummaries(client.data.userId, visibleGroups);
      client.emit('update_users_and_groups', {
        users: safeUsers,
        groups: visibleGroups.map(groupView),
        summaries
      });
      client.emit('group_created', visibleGroups.map(groupView));
    }
  };

  const getSocketUser = async (socket) => {
    if (!socket.data.userId || !socket.data.sessionId) return null;
    const session = await Session.findOne({
      _id: socket.data.sessionId,
      userId: socket.data.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    });
    if (!session) return null;
    const user = await User.findById(socket.data.userId);
    return user || null;
  };

  // Rule 4: Emit session_expired and disconnect socket when session is invalid
  const requireUser = async (socket, callback) => {
    try {
      const user = await getSocketUser(socket);
      if (!user) {
        socket.data.userId = null;
        socket.data.sessionId = null;
        safeAck(callback, { success: false, message: 'Sessiya tugagan. Qayta kiring.', code: 'SESSION_INVALID' });
        socket.emit('session_expired');
        socket.disconnect(true);
        return null;
      }
      return user;
    } catch (error) {
      safeAck(callback, { success: false, message: 'Server xatosi.' });
      return null;
    }
  };

  const createSession = async (user) => {
    const token = newToken();
    const session = await Session.create({
      tokenHash: hashToken(token),
      userId: user._id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    });
    return { token, session };
  };

  const bindSocketSession = async (socket, user, session) => {
    socket.data.userId = String(user._id);
    socket.data.sessionId = String(session._id);
    socket.data.currentRoom = null;
    socket.join(`user:${String(user._id)}`);
    await User.updateOne(
      { _id: user._id },
      { $addToSet: { socketIds: socket.id }, $set: { isOnline: true, socketId: socket.id } }
    );
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next();
      const session = await Session.findOne({
        tokenHash: hashToken(String(token)),
        revokedAt: null,
        expiresAt: { $gt: new Date() }
      });
      if (!session) return next(new Error('SESSION_INVALID'));
      const user = await User.findById(session.userId);
      if (!user) return next(new Error('SESSION_INVALID'));
      socket.data.userId = String(user._id);
      socket.data.sessionId = String(session._id);
      next();
    } catch (error) {
      next(new Error('AUTH_CHECK_FAILED'));
    }
  });

  io.on('connection', async (socket) => {
    const originalOn = socket.on.bind(socket);
    socket.on = (event, handler) =>
      originalOn(event, (...args) => {
        try {
          const result = handler(...args);
          if (result && typeof result.catch === 'function') {
            result.catch((error) => {
              console.error(`Socket event ${event}:`, error);
              const ack = [...args].reverse().find((arg) => typeof arg === 'function');
              safeAck(ack, { success: false, message: 'Server xatosi.', code: 'INTERNAL_ERROR' });
            });
          }
        } catch (error) {
          console.error(`Socket event ${event}:`, error);
          const ack = [...args].reverse().find((arg) => typeof arg === 'function');
          safeAck(ack, { success: false, message: 'Server xatosi.', code: 'INTERNAL_ERROR' });
        }
      });

    if (socket.data.userId && socket.data.sessionId) {
      try {
        const restoredUser = await User.findById(socket.data.userId);
        if (restoredUser) {
          await bindSocketSession(socket, restoredUser, { _id: socket.data.sessionId });
          socket.emit('session_restored', { user: userView(restoredUser) });
          await sendDirectory();
        }
      } catch (error) {
        console.error('Session tiklashda xatolik:', error.message);
      }
    }

    // Rule 15: Validate incoming payloads on server
    socket.on('register', async ({ username, password } = {}, callback) => {
      try {
        if (!rateLimit(`register:${socket.handshake.address}`, 5, 15 * 60 * 1000)) {
          return safeAck(callback, { success: false, message: 'Juda ko‘p urinish. Keyinroq urinib ko‘ring.', code: 'RATE_LIMIT' });
        }
        if (typeof username !== 'string' || typeof password !== 'string') {
          return safeAck(callback, { success: false, message: 'Ma’lumot formati noto‘g‘ri.' });
        }
        const cleanName = username.trim();
        if (cleanName.length < 2 || cleanName.length > 32 || password.length < 6 || password.length > 128) {
          return safeAck(callback, { success: false, message: 'Ism 2–32 belgi, parol esa 6–128 belgi bo‘lsin.' });
        }
        if (await User.exists({ username: cleanName })) {
          return safeAck(callback, { success: false, message: 'Bu ism allaqachon band qilingan!' });
        }
        const user = await User.create({ username: cleanName, password: await bcrypt.hash(password, 10) });
        const { token } = await createSession(user);
        safeAck(callback, { success: true, token, user: userView(user) });
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: error.code === 11000 ? 'Bu ism allaqachon band qilingan!' : 'Ro‘yxatdan o‘tishda server xatosi.'
        });
      }
    });

    socket.on('login', async ({ username, password } = {}, callback) => {
      try {
        if (!rateLimit(`login:${socket.handshake.address}`, 10, 15 * 60 * 1000)) {
          return safeAck(callback, { success: false, message: 'Juda ko‘p login urinishlari. Keyinroq urinib ko‘ring.', code: 'RATE_LIMIT' });
        }
        if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
          return safeAck(callback, { success: false, message: 'Foydalanuvchi nomi va parolni kiriting.' });
        }
        const user = await User.findOne({ username: username.trim() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return safeAck(callback, { success: false, message: 'Ism yoki parol xato!' });
        }
        const { token } = await createSession(user);
        safeAck(callback, { success: true, token, user: userView(user) });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Server xatosi!' });
      }
    });

    socket.on('logout', async (_payload, callback) => {
      try {
        const user = await getSocketUser(socket);
        if (socket.data.sessionId) {
          await Session.updateOne({ _id: socket.data.sessionId }, { $set: { revokedAt: new Date() } });
        }
        const revokedSessionId = socket.data.sessionId;
        const sessionSockets = [...io.sockets.sockets.values()].filter((client) => client.data.sessionId === revokedSessionId);
        if (user) {
          const sessionSocketIds = sessionSockets.map((client) => client.id);
          await User.updateOne({ _id: user._id }, { $pull: { socketIds: { $in: sessionSocketIds } } });
          const fresh = await User.findById(user._id);
          if (fresh) {
            await User.updateOne(
              { _id: user._id },
              { $set: { isOnline: fresh.socketIds.length > 0, socketId: fresh.socketIds.at(-1) || null } }
            );
          }
        }
        safeAck(callback, { success: true });
        for (const client of sessionSockets) {
          client.data.userId = null;
          client.data.sessionId = null;
          client.emit('session_expired');
          client.disconnect(true);
        }
        await sendDirectory();
      } catch (error) {
        safeAck(callback, { success: false, message: 'Chiqishda xatolik.' });
      }
    });

    socket.on('update_profile', async (payload = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        if (!payload || typeof payload !== 'object') {
          return safeAck(callback, { success: false, message: 'Noto‘g‘ri profil ma’lumotlari.' });
        }
        const oldUsername = user.username;
        const newUsername = String(payload.newUsername || user.username).trim();
        if (newUsername.length < 2 || newUsername.length > 32) {
          return safeAck(callback, { success: false, message: 'Ism 2–32 belgi bo‘lishi kerak.' });
        }
        if (newUsername !== user.username && (await User.exists({ username: newUsername, _id: { $ne: user._id } }))) {
          return safeAck(callback, { success: false, message: 'Bu ism band qilingan!' });
        }
        user.username = newUsername;
        if (typeof payload.bio === 'string') user.bio = payload.bio.slice(0, 500);
        await user.save();

        await Message.updateMany({ senderId: user._id }, { $set: { sender: user.username } });
        await Message.updateMany({ receiverId: user._id }, { $set: { receiver: user.username } });
        await Group.updateMany({ adminId: user._id }, { $set: { admin: user.username } });
        await Group.updateMany({ memberIds: user._id }, { $pull: { members: oldUsername } });
        await Group.updateMany({ memberIds: user._id }, { $addToSet: { members: user.username } });

        safeAck(callback, { success: true, newUsername: user.username, user: userView(user) });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, { success: false, message: 'Profilni saqlashda xatolik.' });
      }
    });

    // Rule 5: Acknowledge client first, then disconnect all sockets of deleted account
    socket.on('delete_account', async (_payload, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const id = user._id;
        await Promise.all([
          Session.updateMany({ userId: id, revokedAt: null }, { $set: { revokedAt: new Date() } }),
          Message.deleteMany({ $or: [{ senderId: id }, { receiverId: id }] }),
          Group.updateMany({ memberIds: id }, { $pull: { memberIds: id, members: user.username } })
        ]);
        const adminGroups = await Group.find({ adminId: id });
        for (const group of adminGroups) {
          const nextAdminId = (group.memberIds || []).find((memberId) => String(memberId) !== String(id));
          if (nextAdminId) {
            const nextAdmin = await User.findById(nextAdminId);
            group.adminId = nextAdminId;
            group.admin = nextAdmin ? nextAdmin.username : '';
            await group.save();
          } else {
            await Message.deleteMany({ room: groupRoomId(group) });
            await Group.deleteOne({ _id: group._id });
          }
        }
        await User.deleteOne({ _id: id });

        safeAck(callback, { success: true });

        for (const s of io.sockets.sockets.values()) {
          if (s.data.userId === String(id)) {
            s.data.userId = null;
            s.data.sessionId = null;
            s.emit('session_expired');
            s.disconnect(true);
          }
        }
        await sendDirectory();
      } catch (error) {
        safeAck(callback, { success: false, message: 'Akkauntni o‘chirishda xatolik!' });
      }
    });

    socket.on('create_group', async ({ groupName, members } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const name = typeof groupName === 'string' ? groupName.trim() : '';
        if (!name || name.length > 80) {
          return safeAck(callback, { success: false, message: 'Guruh nomini kiriting (80 belgigacha).' });
        }
        if (await Group.exists({ name })) {
          return safeAck(callback, { success: false, message: 'Bu nomdagi guruh mavjud!' });
        }
        const selectedIds = Array.isArray(members) ? [...new Set(members.map(String).filter(validId))] : [];
        const selectedUsers = await User.find({ _id: { $in: selectedIds } }, '_id username');
        const memberIds = [...new Set([String(user._id), ...selectedUsers.map((u) => String(u._id))])].map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        const memberNames = [...new Set([user.username, ...selectedUsers.map((u) => u.username)])];
        const group = await Group.create({
          name,
          adminId: user._id,
          memberIds,
          admin: user.username,
          members: memberNames
        });
        const view = groupView(group);
        safeAck(callback, { success: true, group: view });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: error.code === 11000 ? 'Bu nomdagi guruh mavjud!' : 'Guruh yaratishda xatolik!'
        });
      }
    });

    // Rule 6: Identify users & chats by ID primarily
    const resolveRoom = async (user, { target, isGroup } = {}) => {
      if (isGroup) {
        const group = await Group.findOne(validId(target) ? { _id: target } : { name: String(target || '') });
        if (!group || !(group.memberIds || []).some((id) => String(id) === String(user._id))) return null;
        return { roomId: groupRoomId(group), group, targetUser: null };
      }
      const targetUser = await User.findOne(validId(target) ? { _id: target } : { username: String(target || '') });
      if (!targetUser || String(targetUser._id) === String(user._id)) return null;
      return { roomId: privateRoomId(user._id, targetUser._id), group: null, targetUser };
    };

    socket.on('join_room', async ({ target, isGroup } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const resolved = await resolveRoom(user, { target, isGroup });
        if (!resolved) {
          return safeAck(callback, { success: false, message: 'Chat topilmadi yoki unga kirish huquqingiz yo‘q.' });
        }
        for (const room of [...socket.rooms]) {
          if (room !== socket.id && room !== `user:${String(user._id)}`) socket.leave(room);
        }
        socket.join(resolved.roomId);
        socket.data.currentRoom = resolved.roomId;
        const history = await Message.find({ room: resolved.roomId }).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
        history.reverse();
        socket.emit('room_joined', {
          room: resolved.roomId,
          target: resolved.group ? resolved.group.name : resolved.targetUser.username,
          targetId: resolved.group ? String(resolved.group._id) : String(resolved.targetUser._id),
          isGroup: !!resolved.group
        });
        socket.emit('load_history', { room: resolved.roomId, history });
        safeAck(callback, { success: true, room: resolved.roomId });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Chatni ochishda xatolik.' });
      }
    });

    socket.on('leave_room', async ({ room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      const current = socket.data.currentRoom;
      if (!current || (room && room !== current)) return safeAck(callback, { success: true });
      const typingKey = `${user._id}:${current}`;
      if (typingTimers.has(typingKey)) clearTimeout(typingTimers.get(typingKey));
      typingTimers.delete(typingKey);
      socket.to(current).emit('hide_typing', { username: user.username, userId: String(user._id), room: current });
      socket.leave(current);
      socket.data.currentRoom = null;
      safeAck(callback, { success: true });
    });

    const authorizeRoomFromCurrent = async (socket, user, suppliedRoom) => {
      const room = socket.data.currentRoom;
      if (!room || (suppliedRoom && suppliedRoom !== room) || !socket.rooms.has(room)) return null;
      if (room.startsWith('group:')) {
        const id = room.slice('group:'.length);
        const group = await Group.findById(id);
        if (!group || !(group.memberIds || []).some((memberId) => String(memberId) === String(user._id))) return null;
        return { room, group };
      }
      if (room.startsWith('dm:')) {
        const ids = room.slice(3).split(':');
        if (ids.length !== 2 || !ids.includes(String(user._id))) return null;
        return { room, group: null };
      }
      return null;
    };

    // Rule 8: Compound cursor pagination using both createdAt and _id
    socket.on('load_older_messages', async ({ room, before, beforeId } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) return safeAck(callback, { success: false, message: 'Chat tarixiga ruxsat yo‘q.' });
        const cursor = before ? new Date(before) : new Date();
        if (Number.isNaN(cursor.getTime())) return safeAck(callback, { success: false, message: 'Sana kursori noto‘g‘ri.' });

        const filter = { room: authorized.room };
        if (beforeId && validId(beforeId)) {
          const objId = new mongoose.Types.ObjectId(String(beforeId));
          filter.$or = [
            { createdAt: { $lt: cursor } },
            { createdAt: cursor, _id: { $lt: objId } }
          ];
        } else {
          filter.createdAt = { $lt: cursor };
        }

        const history = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(50).lean();
        history.reverse();
        safeAck(callback, { success: true, room: authorized.room, history, hasMore: history.length === 50 });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Eski xabarlarni yuklab bo‘lmadi.' });
      }
    });

    socket.on('send_message', async (data = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        if (!data || typeof data !== 'object') {
          return safeAck(callback, { success: false, message: 'Xabar ma’lumotlari noto‘g‘ri.' });
        }
        if (!rateLimit(`message:${user._id}`, 60, 60 * 1000)) {
          return safeAck(callback, { success: false, message: 'Juda tez xabar yuboryapsiz. Biroz kuting.', code: 'RATE_LIMIT' });
        }
        const resolved = await resolveRoom(user, {
          target: data.isGroup ? data.groupId || data.target : data.target,
          isGroup: !!data.isGroup
        });
        if (!resolved || socket.data.currentRoom !== resolved.roomId || !socket.rooms.has(resolved.roomId)) {
          return safeAck(callback, { success: false, message: 'Bu chatga xabar yuborish huquqingiz yo‘q.' });
        }

        const text = typeof data.text === 'string' ? data.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
        const fileMatch = typeof data.file === 'string' ? data.file.match(/^\/api\/files\/([0-9a-f-]{36})$/i) : null;
        const file = fileMatch ? data.file : null;
        if (!text && !file) return safeAck(callback, { success: false, message: 'Bo‘sh xabar yuborib bo‘lmaydi.' });
        if (data.file && !file) {
          return safeAck(callback, { success: false, message: 'Avval faylni xavfsiz yuklang yoki fayl manzili noto‘g‘ri.', code: 'INVALID_FILE' });
        }

        // Rule 13: Verify file ownership and target chat room on the server before attaching to a message
        let verifiedUpload = null;
        if (fileMatch) {
          const fileId = fileMatch[1];
          verifiedUpload = await UploadedFile.findOne({ fileId });
          if (!verifiedUpload) {
            return safeAck(callback, { success: false, message: 'Yuklangan fayl topilmadi.', code: 'FILE_NOT_FOUND' });
          }
          if (String(verifiedUpload.ownerId) !== String(user._id)) {
            return safeAck(callback, { success: false, message: 'Bu fayl sizga tegishli emas!', code: 'FILE_OWNER_MISMATCH' });
          }
          if (verifiedUpload.room !== resolved.roomId) {
            return safeAck(callback, { success: false, message: 'Fayl boshqa chat uchun yuklangan!', code: 'FILE_ROOM_MISMATCH' });
          }
        }

        const clientMessageId = validString(data.clientMessageId, 80) ? data.clientMessageId : null;
        if (clientMessageId) {
          const existing = await Message.findOne({ senderId: user._id, clientMessageId });
          if (existing) return safeAck(callback, { success: true, message: existing, duplicate: true });
        }

        const safeReply =
          data.replyTo && typeof data.replyTo === 'object'
            ? {
                sender: String(data.replyTo.sender || '').slice(0, 64),
                text: String(data.replyTo.text || '').slice(0, 500)
              }
            : null;

        const msg = await Message.create({
          id: crypto.randomUUID(),
          ...(clientMessageId ? { clientMessageId } : {}),
          room: resolved.roomId,
          senderId: user._id,
          receiverId: resolved.targetUser ? resolved.targetUser._id : undefined,
          sender: user.username,
          receiver: resolved.targetUser ? resolved.targetUser.username : resolved.group.name,
          text,
          file,
          fileName: verifiedUpload ? verifiedUpload.fileName : String(data.fileName || '').slice(0, 255),
          fileType: verifiedUpload ? verifiedUpload.fileType : String(data.fileType || '').slice(0, 100),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isRead: false,
          isEdited: false,
          replyTo: safeReply,
          reactions: {}
        });

        if (verifiedUpload) {
          verifiedUpload.attached = true;
          await verifiedUpload.save();
        }

        if (resolved.group) {
          io.to(resolved.roomId).emit('receive_message', msg);
          for (const memberId of resolved.group.memberIds || []) {
            io.to(`user:${String(memberId)}`).emit('receive_message', msg);
          }
        } else {
          io.to(`user:${String(resolved.targetUser._id)}`).emit('receive_message', msg);
          io.to(`user:${String(user._id)}`).emit('receive_message', msg);
        }
        safeAck(callback, { success: true, message: msg });
      } catch (error) {
        if (error.code === 11000 && validString(data.clientMessageId, 80)) {
          const existing = await Message.findOne({ senderId: user._id, clientMessageId: data.clientMessageId });
          if (existing) return safeAck(callback, { success: true, message: existing, duplicate: true });
        }
        safeAck(callback, { success: false, message: 'Xabar yuborishda xatolik.' });
      }
    });

    // Rule 9: Single unified mark_read handler marking only unread incoming messages up to cursor
    socket.on('mark_read', async ({ room, upToMessageId } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized || authorized.group) {
          return safeAck(callback, { success: false, message: 'O‘qilganlikni belgilashga ruxsat yo‘q.' });
        }
        const lastMessage = await Message.findOne({
          id: String(upToMessageId || ''),
          room: authorized.room,
          receiverId: user._id
        });
        if (!lastMessage) return safeAck(callback, { success: false, message: 'Xabar topilmadi.' });

        await Message.updateMany(
          {
            room: authorized.room,
            receiverId: user._id,
            isRead: false,
            $or: [
              { createdAt: { $lt: lastMessage.createdAt } },
              { createdAt: lastMessage.createdAt, _id: { $lte: lastMessage._id } }
            ]
          },
          { $set: { isRead: true } }
        );
        io.to(authorized.room).emit('messages_read', {
          readerId: String(user._id),
          room: authorized.room,
          upToMessageId: lastMessage.id
        });
        safeAck(callback, { success: true });
      } catch (error) {
        safeAck(callback, { success: false, message: 'O‘qilganlik holatini saqlab bo‘lmadi.' });
      }
    });

    socket.on('typing', async ({ room } = {}) => {
      const user = await getSocketUser(socket);
      if (!user) return;
      const authorized = await authorizeRoomFromCurrent(socket, user, room);
      if (!authorized) return;
      const typingKey = `${user._id}:${authorized.room}`;
      if (typingTimers.has(typingKey)) clearTimeout(typingTimers.get(typingKey));
      typingTimers.set(
        typingKey,
        setTimeout(() => {
          typingTimers.delete(typingKey);
          io.to(authorized.room).emit('hide_typing', {
            username: user.username,
            userId: String(user._id),
            room: authorized.room
          });
        }, 3000)
      );
      socket.to(authorized.room).emit('display_typing', {
        username: user.username,
        userId: String(user._id),
        room: authorized.room
      });
    });

    socket.on('stop_typing', async ({ room } = {}) => {
      const user = await getSocketUser(socket);
      if (!user) return;
      const authorized = await authorizeRoomFromCurrent(socket, user, room);
      if (!authorized) return;
      const typingKey = `${user._id}:${authorized.room}`;
      if (typingTimers.has(typingKey)) clearTimeout(typingTimers.get(typingKey));
      typingTimers.delete(typingKey);
      socket.to(authorized.room).emit('hide_typing', {
        username: user.username,
        userId: String(user._id),
        room: authorized.room
      });
    });

    socket.on('delete_message', async ({ msgId, room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) return safeAck(callback, { success: false, message: 'Chatga ruxsat yo‘q.' });
        const msg = await Message.findOne({ id: String(msgId || ''), room: authorized.room });
        if (!msg) return safeAck(callback, { success: false, message: 'Xabar topilmadi.' });
        const ownsMessage = String(msg.senderId) === String(user._id);
        const isGroupAdmin = authorized.group && String(authorized.group.adminId) === String(user._id);
        if (!ownsMessage && !isGroupAdmin) {
          return safeAck(callback, {
            success: false,
            message: 'Faqat o‘z xabaringizni (yoki admin sifatida guruh xabarini) o‘chira olasiz.'
          });
        }
        await Message.deleteOne({ _id: msg._id });
        io.to(authorized.room).emit('message_deleted', { room: authorized.room, msgId: msg.id });
        safeAck(callback, { success: true });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Xabarni o‘chirishda xatolik.' });
      }
    });

    socket.on('edit_message', async ({ msgId, newText, room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        if (typeof newText !== 'string' || !newText.trim()) {
          return safeAck(callback, { success: false, message: 'Tahrirlangan matn bo‘sh bo‘lishi mumkin emas.' });
        }
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) return safeAck(callback, { success: false, message: 'Chatga ruxsat yo‘q.' });
        const msg = await Message.findOne({ id: String(msgId || ''), room: authorized.room, senderId: user._id });
        if (!msg) return safeAck(callback, { success: false, message: 'Faqat o‘z xabaringizni tahrirlay olasiz.' });
        msg.text = newText.trim().slice(0, MAX_TEXT_LENGTH);
        msg.isEdited = true;
        await msg.save();
        io.to(authorized.room).emit('message_updated', { room: authorized.room, message: msg });
        safeAck(callback, { success: true, message: msg });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Xabarni tahrirlashda xatolik.' });
      }
    });

    // Rule 6: Store reactions keyed by user ID (with legacy username cleanup)
    socket.on('toggle_reaction', async ({ msgId, emoji, room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) return safeAck(callback, { success: false, message: 'Chatga ruxsat yo‘q.' });
        const msg = await Message.findOne({ id: String(msgId || ''), room: authorized.room });
        if (!msg) return safeAck(callback, { success: false, message: 'Xabar topilmadi.' });
        const reaction = typeof emoji === 'string' ? emoji.trim().slice(0, 12) : '';
        if (!reaction) return safeAck(callback, { success: false, message: 'Reaksiya noto‘g‘ri.' });

        const uid = String(user._id);
        const reactors = msg.reactions.get(reaction) || [];
        const uidIndex = reactors.indexOf(uid);
        const nameIndex = reactors.indexOf(user.username);

        if (uidIndex >= 0 || nameIndex >= 0) {
          if (uidIndex >= 0) reactors.splice(uidIndex, 1);
          if (nameIndex >= 0 && reactors.indexOf(user.username) >= 0) {
            reactors.splice(reactors.indexOf(user.username), 1);
          }
        } else {
          reactors.push(uid);
        }

        if (reactors.length) msg.reactions.set(reaction, reactors);
        else msg.reactions.delete(reaction);

        await msg.save();
        io.to(authorized.room).emit('message_updated', { room: authorized.room, message: msg });
        safeAck(callback, { success: true, message: msg });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Reaksiyani saqlashda xatolik.' });
      }
    });

    socket.on('clear_chat', async ({ room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) return safeAck(callback, { success: false, message: 'Chatga ruxsat yo‘q.' });
        if (authorized.group && String(authorized.group.adminId) !== String(user._id)) {
          return safeAck(callback, { success: false, message: 'Guruh tarixini faqat admin tozalashi mumkin.' });
        }
        await Message.deleteMany({ room: authorized.room });
        io.to(authorized.room).emit('load_history', { room: authorized.room, history: [] });
        safeAck(callback, { success: true });
      } catch (error) {
        safeAck(callback, { success: false, message: 'Chat tarixini tozalashda xatolik.' });
      }
    });

    // Rule 14: Notify all tabs of the user leaving/removed from group so group window closes everywhere
    socket.on('delete_or_leave_group', async ({ groupId, groupName } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const group = await Group.findOne(
          validId(groupId || groupName) ? { _id: groupId || groupName } : { name: String(groupName || '') }
        );
        if (!group) return safeAck(callback, { success: false, message: 'Guruh topilmadi.' });
        const userIdStr = String(user._id);
        const roomId = groupRoomId(group);
        const isAdmin = String(group.adminId) === userIdStr;
        const isMember = (group.memberIds || []).some((id) => String(id) === userIdStr);
        if (!isMember) return safeAck(callback, { success: false, message: 'Siz bu guruh a’zosi emassiz.' });

        if (isAdmin) {
          await Message.deleteMany({ room: roomId });
          await Group.deleteOne({ _id: group._id });
          io.to(roomId).emit('chat_deleted', { room: roomId });
          for (const memberId of group.memberIds || []) {
            io.to(`user:${String(memberId)}`).emit('chat_deleted', { room: roomId });
          }
          for (const s of io.sockets.sockets.values()) {
            if (s.rooms.has(roomId)) {
              s.leave(roomId);
              if (s.data.currentRoom === roomId) s.data.currentRoom = null;
            }
          }
        } else {
          group.memberIds = group.memberIds.filter((id) => String(id) !== userIdStr);
          group.members = group.members.filter((name) => name !== user.username);
          await group.save();
          io.to(`user:${userIdStr}`).emit('chat_deleted', { room: roomId });
          for (const s of io.sockets.sockets.values()) {
            if (s.data.userId === userIdStr && s.rooms.has(roomId)) {
              s.leave(roomId);
              if (s.data.currentRoom === roomId) s.data.currentRoom = null;
            }
          }
        }
        safeAck(callback, { success: true });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, { success: false, message: 'Guruh amalida xatolik.' });
      }
    });

    socket.on('remove_group_member', async ({ groupId, groupName, memberId, memberUsername } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const group = await Group.findOne(
          validId(groupId || groupName) ? { _id: groupId || groupName } : { name: String(groupName || '') }
        );
        if (!group) return safeAck(callback, { success: false, message: 'Guruh topilmadi.' });
        if (String(group.adminId) !== String(user._id)) {
          return safeAck(callback, { success: false, message: 'A’zoni faqat guruh admini chiqarishi mumkin.' });
        }
        const targetUser = validId(memberId)
          ? await User.findById(memberId)
          : await User.findOne({ username: String(memberUsername || '') });
        if (!targetUser || String(targetUser._id) === String(group.adminId)) {
          return safeAck(callback, { success: false, message: 'A’zo topilmadi yoki adminni chiqarib bo‘lmaydi.' });
        }
        const targetIdStr = String(targetUser._id);
        const wasMember = (group.memberIds || []).some((id) => String(id) === targetIdStr);
        if (!wasMember) return safeAck(callback, { success: false, message: 'Bu foydalanuvchi guruh a’zosi emas.' });

        group.memberIds = group.memberIds.filter((id) => String(id) !== targetIdStr);
        group.members = group.members.filter((name) => name !== targetUser.username);
        await group.save();

        const roomId = groupRoomId(group);
        io.to(`user:${targetIdStr}`).emit('chat_deleted', { room: roomId });
        for (const client of io.sockets.sockets.values()) {
          if (client.data.userId === targetIdStr && client.rooms.has(roomId)) {
            client.leave(roomId);
            if (client.data.currentRoom === roomId) client.data.currentRoom = null;
          }
        }
        safeAck(callback, { success: true });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, { success: false, message: 'A’zoni guruhdan chiqarishda xatolik.' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        if (socket.data.userId) {
          const user = await User.findById(socket.data.userId);
          if (user && socket.data.currentRoom) {
            const key = `${user._id}:${socket.data.currentRoom}`;
            if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
            typingTimers.delete(key);
            io.to(socket.data.currentRoom).emit('hide_typing', {
              username: user.username,
              userId: String(user._id),
              room: socket.data.currentRoom
            });
          }
          if (user) {
            await User.updateOne({ _id: user._id }, { $pull: { socketIds: socket.id } });
            const fresh = await User.findById(user._id);
            if (fresh) {
              await User.updateOne(
                { _id: fresh._id },
                { $set: { isOnline: fresh.socketIds.length > 0, socketId: fresh.socketIds.at(-1) || null } }
              );
            }
            await sendDirectory();
          }
        }
      } catch (error) {
        console.error('Disconnect cleanup error:', error.message);
      }
    });
  });

  return { sendDirectory };
}

module.exports = { setupSocketHandlers };
