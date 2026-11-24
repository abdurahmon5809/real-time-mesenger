const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Session, Message, Group, DEFAULT_BIO } = require("../models");
const { hashToken, privateRoomId, groupRoomId } = require("../lib/chat-ids");
const { UploadedFile } = require("../models");
const { validateMessageText } = require("../lib/message-validation");
const { isLatestRequest } = require("../lib/request-guard");
const { buildReadCursorUpdate } = require("../lib/read-cursor");
const { createChatDirectoryService } = require("./modules/chat-list");
const { disconnectExpiredSessionSockets } = require("./modules/session-expiry");
const { removeSocketIdsAndRefreshPresence } = require("../lib/socket-presence");
const { registerAuthHandlers } = require("./modules/auth");
const { registerProfileHandlers } = require("./modules/profile");
const { registerGroupCreationHandlers } = require("./modules/group");
const { registerMessageHandlers } = require("./modules/message");
const { registerGroupMembershipHandlers } = require("./modules/group");
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

const validId = (value) => mongoose.isValidObjectId(String(value || ""));
const validString = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const newToken = () => crypto.randomBytes(32).toString("base64url");

const sanitizeAvatar = (av) => {
  if (!av || typeof av !== "string") return "";
  if (av.startsWith("data:")) return "";
  return av;
};

const userView = (user) => ({
  id: String(user._id),
  userId: String(user._id),
  username: user.username,
  avatar: sanitizeAvatar(user.avatar),
  bio: user.bio || DEFAULT_BIO,
  isOnline: !!user.isOnline,
});

const groupView = (group) => ({
  ...group.toObject(),
  id: String(group._id),
  groupId: String(group._id),
  roomId: `group:${group._id}`,
  adminId: group.adminId ? String(group.adminId) : undefined,
  memberIds: (group.memberIds || []).map(String),
});

const safeAck = (callback, result) => {
  if (typeof callback === "function") callback(result);
};


function setupSocketHandlers(io) {
  const { sendDirectory } = createChatDirectoryService({
    io, User, Group, Message, userView, groupView,
  });

  const getSocketUser = async (socket) => {
    if (!socket.data.userId || !socket.data.sessionId) return null;
    const session = await Session.findOne({
      _id: socket.data.sessionId,
      userId: socket.data.userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) return null;
    const user = await User.findById(socket.data.userId);
    return user || null;
  };

  const requireUser = async (socket, callback) => {
    try {
      const user = await getSocketUser(socket);
      if (!user) {
        // Keep identity metadata until disconnect cleanup removes this socket
        // from User.socketIds and recalculates online status.
        safeAck(callback, {
          success: false,
          message: "Sessiya tugagan. Qayta kiring.",
          code: "SESSION_INVALID",
        });
        socket.emit("session_expired");
        socket.disconnect(true);
        return null;
      }
      return user;
    } catch (error) {
      safeAck(callback, {
        success: false,
        message: "Server xatosi.",
        code: "INTERNAL_ERROR",
      });
      return null;
    }
  };

  const createSession = async (user) => {
    const token = newToken();
    const session = await Session.create({
      tokenHash: hashToken(token),
      userId: user._id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
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
      {
        $addToSet: { socketIds: socket.id },
        $set: { isOnline: true, socketId: socket.id },
      },
    );
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next();
      const session = await Session.findOne({
        tokenHash: hashToken(String(token)),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (!session) return next(new Error("SESSION_INVALID"));
      const user = await User.findById(session.userId);
      if (!user) return next(new Error("SESSION_INVALID"));
      socket.data.userId = String(user._id);
      socket.data.sessionId = String(session._id);
      next();
    } catch (error) {
      next(new Error("AUTH_CHECK_FAILED"));
    }
  });

  io.on("connection", async (socket) => {
    const originalOn = socket.on.bind(socket);
    socket.on = (event, handler) =>
      originalOn(event, (...args) => {
        try {
          const result = handler(...args);
          if (result && typeof result.catch === "function") {
            result.catch((error) => {
              console.error(`Socket event ${event}:`, error);
              const ack = [...args]
                .reverse()
                .find((arg) => typeof arg === "function");
              safeAck(ack, {
                success: false,
                message: "Server xatosi.",
                code: "INTERNAL_ERROR",
              });
            });
          }
        } catch (error) {
          console.error(`Socket event ${event}:`, error);
          const ack = [...args]
            .reverse()
            .find((arg) => typeof arg === "function");
          safeAck(ack, {
            success: false,
            message: "Server xatosi.",
            code: "INTERNAL_ERROR",
          });
        }
      });

    registerAuthHandlers(socket, {
      io, User, Session, Message, Group, bcrypt, userView, safeAck, rateLimit, createSession, sendDirectory, groupRoomId, removeSocketIdsAndRefreshPresence,
    });
    registerProfileHandlers(socket, {
      io, User, Session, Message, Group, userView, safeAck, requireUser, sendDirectory, groupRoomId,
    });
    registerGroupCreationHandlers(socket, {
      io, User, Group, mongoose, safeAck, requireUser, validId, groupView, sendDirectory,
    });

    const resolveRoom = async (user, { target, isGroup } = {}) => {
      if (isGroup) {
        const group = await Group.findOne(
          validId(target) ? { _id: target } : { name: String(target || "") },
        );
        if (
          !group ||
          !(group.memberIds || []).some((id) => String(id) === String(user._id))
        )
          return null;
        return { roomId: groupRoomId(group), group, targetUser: null };
      }
      const targetUser = await User.findOne(
        validId(target) ? { _id: target } : { username: String(target || "") },
      );
      if (!targetUser || String(targetUser._id) === String(user._id))
        return null;
      return {
        roomId: privateRoomId(user._id, targetUser._id),
        group: null,
        targetUser,
      };
    };

    socket.on("join_room", async ({ target, isGroup, requestId } = {}, callback) => {
      socket.data.joinRequestId = typeof requestId === "string" ? requestId : null;
      const thisJoinRequestId = socket.data.joinRequestId;
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const resolved = await resolveRoom(user, { target, isGroup });
        if (!isLatestRequest(thisJoinRequestId, socket.data.joinRequestId)) {
          return safeAck(callback, { success: false, code: "STALE_JOIN", message: "Eski chat so‘rovi bekor qilindi." });
        }
        if (!resolved) {
          return safeAck(callback, {
            success: false,
            message: "Chat topilmadi yoki unga kirish huquqingiz yo‘q.",
            code: "ROOM_ACCESS_DENIED",
          });
        }
        for (const room of [...socket.rooms]) {
          if (room !== socket.id && room !== `user:${String(user._id)}`)
            socket.leave(room);
        }
        socket.join(resolved.roomId);
        socket.data.currentRoom = resolved.roomId;

        const history = await Message.find({ room: resolved.roomId })
          .sort({ createdAt: -1, _id: -1 })
          .limit(50)
          .lean();
        history.reverse();
        if (!isLatestRequest(thisJoinRequestId, socket.data.joinRequestId) || socket.data.currentRoom !== resolved.roomId) {
          return safeAck(callback, { success: false, code: "STALE_JOIN", message: "Eski chat javobi bekor qilindi." });
        }
        socket.emit("room_joined", {
          requestId: typeof requestId === "string" ? requestId : null,
          room: resolved.roomId,
          target: resolved.group
            ? resolved.group.name
            : resolved.targetUser.username,
          targetId: resolved.group
            ? String(resolved.group._id)
            : String(resolved.targetUser._id),
          isGroup: !!resolved.group,
        });
        socket.emit("load_history", {
          requestId: typeof requestId === "string" ? requestId : null,
          room: resolved.roomId,
          history,
        });
        safeAck(callback, { success: true, room: resolved.roomId, requestId });
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Chatni ochishda xatolik.",
          code: "JOIN_ROOM_ERROR",
        });
      }
    });

    socket.on("leave_room", async ({ room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      const current = socket.data.currentRoom;
      if (!current || (room && room !== current))
        return safeAck(callback, { success: true });
      const typingKey = `${user._id}:${current}`;
      if (typingTimers.has(typingKey))
        clearTimeout(typingTimers.get(typingKey));
      typingTimers.delete(typingKey);
      socket
        .to(current)
        .emit("hide_typing", {
          username: user.username,
          userId: String(user._id),
          room: current,
        });
      socket.leave(current);
      socket.data.currentRoom = null;
      safeAck(callback, { success: true });
    });

    const authorizeRoomFromCurrent = async (socket, user, suppliedRoom) => {
      const room = socket.data.currentRoom;
      if (
        !room ||
        (suppliedRoom && suppliedRoom !== room) ||
        !socket.rooms.has(room)
      )
        return null;
      if (room.startsWith("group:")) {
        const id = room.slice("group:".length);
        const group = await Group.findById(id);
        if (
          !group ||
          !(group.memberIds || []).some(
            (memberId) => String(memberId) === String(user._id),
          )
        )
          return null;
        return { room, group };
      }
      if (room.startsWith("dm:")) {
        const ids = room.slice(3).split(":");
        if (ids.length !== 2 || !ids.includes(String(user._id))) return null;
        return { room, group: null };
      }
      return null;
    };

    registerMessageHandlers(socket, {
      io, User, Session, Message, Group, UploadedFile, mongoose, crypto, safeAck, requireUser, getSocketUser,
      rateLimit, validId, validString, resolveRoom, authorizeRoomFromCurrent,
      validateMessageText, buildReadCursorUpdate, groupRoomId, isLatestRequest, typingTimers, sendDirectory,
    });
    registerGroupMembershipHandlers(socket, {
      io, User, Message, Group, safeAck, requireUser, validId, groupRoomId, sendDirectory,
    });

    socket.on("disconnect", async () => {
      try {
        if (socket.data.userId) {
          const user = await User.findById(socket.data.userId);
          if (user && socket.data.currentRoom) {
            const key = `${user._id}:${socket.data.currentRoom}`;
            if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
            typingTimers.delete(key);
            io.to(socket.data.currentRoom).emit("hide_typing", {
              username: user.username,
              userId: String(user._id),
              room: socket.data.currentRoom,
            });
          }
          if (user) {
            await removeSocketIdsAndRefreshPresence(User, user._id, [socket.id]);
            await sendDirectory();
          }
        }
      } catch (error) {
        console.error("Disconnect cleanup error:", error.message);
      }
    });

    // IMPORTANT: all socket event listeners above are registered synchronously
    // before this asynchronous session restoration starts. The client may emit
    // join_room as soon as it receives session_restored.
    if (socket.data.userId && socket.data.sessionId) {
      void (async () => {
        try {
          const restoredUser = await User.findById(socket.data.userId);
          if (!restoredUser || !socket.connected) return;
          await bindSocketSession(socket, restoredUser, { _id: socket.data.sessionId });
          if (!socket.connected) {
            await removeSocketIdsAndRefreshPresence(User, restoredUser._id, [socket.id]);
            return;
          }
          socket.emit("session_restored", { user: userView(restoredUser) });
          await sendDirectory();
        } catch (error) {
          console.error("Session tiklashda xatolik:", error.message);
          if (socket.connected) {
            socket.emit("session_expired", { message: "Sessiyani tiklab bo‘lmadi. Qayta kiring." });
            socket.disconnect(true);
          }
        }
      })();
    }
  });

  // Expire authenticated sockets even when the client is idle and sends no events.
  const expiryTimer = setInterval(async () => {
    try {
      await disconnectExpiredSessionSockets(io, Session);
    } catch (error) {
      console.error("Session expiry scan error:", error.message);
    }
  }, 15000);
  if (typeof expiryTimer.unref === "function") expiryTimer.unref();

  return { sendDirectory, stopSessionExpiry: () => clearInterval(expiryTimer) };
}

module.exports = { setupSocketHandlers };
