const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
// ⭐️ Katta hajmdagi fayllarni qabul qilish uchun limitni oshirish (masalan, 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 5e7, // 50 MB socket limit
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const DB_URI = 'mongodb://127.0.0.1:27017/telegram_web_pro';

mongoose.connect(DB_URI)
  .then(() => {
    console.log('✅ Local MongoDB bazasiga muvaffaqiyatli ulandi!');
  })
  .catch((err) => {
    console.error('❌ MongoDB ulanishida xatolik:', err);
  });

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: 'Hey there! I am using Telegram Web Pro.' },
  isOnline: { type: Boolean, default: false },
  socketId: { type: String, default: null }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  id: String,
  room: String,
  sender: String,
  receiver: String,
  text: String,
  file: String,
  fileName: String,
  fileType: String,
  time: String,
  isRead: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  replyTo: Object,
  reactions: { type: Map, of: [String], default: {} }
});
const Message = mongoose.model('Message', messageSchema);

const groupSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  admin: String,
  members: [String],
  avatar: { type: String, default: '' }
});
const Group = mongoose.model('Group', groupSchema);

io.on('connection', (socket) => {
  console.log(`Foydalanuvchi ulandi: ${socket.id}`);

  socket.on('register', async ({ username, password }, callback) => {
    try {
      const existing = await User.findOne({ username });
      if (existing) {
        return callback({ success: false, message: 'Bu ism allaqachon band qilingan!' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username, password: hashedPassword });
      await newUser.save();
      callback({ success: true, user: { username, avatar: '', bio: newUser.bio } });
    } catch (e) {
      callback({ success: false, message: 'Server xatosi yuz berdi!' });
    }
  });

  socket.on('login', async ({ username, password }, callback) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return callback({ success: false, message: 'Ism yoki parol xato!' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return callback({ success: false, message: 'Ism yoki parol xato!' });

      callback({ success: true, user: { username: user.username, avatar: user.avatar, bio: user.bio } });
    } catch (e) {
      callback({ success: false, message: 'Server xatosi!' });
    }
  });

  socket.on('join_user', async ({ username, avatar, bio }) => {
    await User.findOneAndUpdate(
      { username }, 
      { isOnline: true, socketId: socket.id, avatar, bio }, 
      { upsert: true, new: true }
    );
    
    const users = await User.find({}, 'username avatar bio isOnline');
    const groups = await Group.find({});
    io.emit('update_users_and_groups', { users, groups });
  });

  socket.on('update_profile', async ({ oldUsername, newUsername, bio, avatar }, callback) => {
    try {
      if (oldUsername !== newUsername) {
        const existing = await User.findOne({ username: newUsername });
        if (existing) return callback({ success: false, message: 'Bu ism band qilingan!' });
      }
      await User.findOneAndUpdate({ username: oldUsername }, { username: newUsername, bio, avatar });
      callback({ success: true, newUsername });
      
      const users = await User.find({}, 'username avatar bio isOnline');
      const groups = await Group.find({});
      io.emit('update_users_and_groups', { users, groups });
    } catch (e) {
      callback({ success: false, message: 'Xatolik yuz berdi' });
    }
  });

  socket.on('delete_account', async ({ username }, callback) => {
    try {
      await User.deleteOne({ username });
      await Message.deleteMany({ $or: [{ sender: username }, { receiver: username }] });
      
      const users = await User.find({}, 'username avatar bio isOnline');
      const groups = await Group.find({});
      io.emit('update_users_and_groups', { users, groups });
      
      callback({ success: true });
    } catch (e) {
      callback({ success: false, message: 'Akkauntni o\'chirishda xatolik!' });
    }
  });

  socket.on('create_group', async ({ groupName, admin, members }, callback) => {
    try {
      const exists = await Group.findOne({ name: groupName });
      if (exists) return callback({ success: false, message: 'Bu nomdagi guruh mavjud!' });

      const newGroup = new Group({ name: groupName, admin, members: [...members, admin] });
      await newGroup.save();

      const groups = await Group.find({});
      io.emit('group_created', groups);
      callback({ success: true, group: newGroup });
    } catch (e) {
      callback({ success: false, message: 'Guruh yaratishda xatolik!' });
    }
  });

  socket.on('join_room', async ({ sender, target, isGroup }) => {
    const roomName = isGroup ? target : [sender, target].sort().join('_');
    
    Array.from(socket.rooms).forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });

    socket.join(roomName);

    if (!isGroup) {
      await Message.updateMany(
        { room: roomName, sender: target, receiver: sender, isRead: false }, 
        { $set: { isRead: true } }
      );
      io.to(roomName).emit('messages_read', { reader: sender, room: roomName });
    }

    const history = await Message.find({ room: roomName });
    socket.emit('load_history', { room: roomName, history });
  });

  socket.on('send_message', async (data) => {
    const { sender, target, text, file, fileName, fileType, time, isGroup, replyTo } = data;
    const roomName = isGroup ? target : [sender, target].sort().join('_');

    const roomClients = io.sockets.adapter.rooms.get(roomName);
    let isTargetInRoom = false;
    if (roomClients && roomClients.size > 1) {
      isTargetInRoom = true;
    }

    const newMessage = new Message({
      id: Date.now() + Math.random().toString(),
      room: roomName,
      sender,
      receiver: target,
      text,
      file,
      fileName,
      fileType,
      time,
      isRead: isGroup ? false : isTargetInRoom,
      isEdited: false,
      replyTo: replyTo || null,
      reactions: {}
    });

    await newMessage.save();
    io.to(roomName).emit('receive_message', newMessage);
  });

  socket.on('typing', ({ room, username }) => {
    socket.to(room).emit('display_typing', { username, room });
  });

  socket.on('stop_typing', ({ room, username }) => {
    socket.to(room).emit('hide_typing', { username, room });
  });

  socket.on('delete_message', async ({ msgId, room }) => {
    await Message.findOneAndDelete({ id: msgId });
    const history = await Message.find({ room });
    io.to(room).emit('load_history', { room, history });
  });

  socket.on('edit_message', async ({ msgId, newText, room }) => {
    await Message.findOneAndUpdate({ id: msgId }, { text: newText, isEdited: true });
    const history = await Message.find({ room });
    io.to(room).emit('load_history', { room, history });
  });

  socket.on('toggle_reaction', async ({ msgId, emoji, username, room }) => {
    const msg = await Message.findOne({ id: msgId });
    if (msg) {
      if (!msg.reactions.get(emoji)) {
        msg.reactions.set(emoji, [username]);
      } else {
        const users = msg.reactions.get(emoji);
        const idx = users.indexOf(username);
        if (idx > -1) {
          users.splice(idx, 1);
          if (users.length === 0) msg.reactions.delete(emoji);
        } else {
          users.push(username);
        }
      }
      await msg.save();
      const history = await Message.find({ room });
      io.to(room).emit('load_history', { room, history });
    }
  });

  socket.on('clear_chat', async ({ room }) => {
    await Message.deleteMany({ room });
    io.to(room).emit('load_history', { room, history: [] });
  });

  socket.on('delete_or_leave_group', async ({ groupName, username }, callback) => {
    try {
      const group = await Group.findOne({ name: groupName });
      if (!group) return callback({ success: false, message: 'Guruh topilmadi' });

      if (group.admin === username) {
        await Group.deleteOne({ name: groupName });
        await Message.deleteMany({ room: groupName });
      } else {
        group.members = group.members.filter(m => m !== username);
        await group.save();
      }

      const groups = await Group.find({});
      io.emit('group_created', groups);
      callback({ success: true });
    } catch (e) {
      callback({ success: false, message: 'Xatolik yuz berdi' });
    }
  });

  socket.on('disconnect', async () => {
    const updatedUser = await User.findOneAndUpdate(
      { socketId: socket.id }, 
      { isOnline: false, socketId: null },
      { new: true }
    );
    
    if (updatedUser) {
      const users = await User.find({}, 'username avatar bio isOnline');
      const groups = await Group.find({});
      io.emit('update_users_and_groups', { users, groups });
    }
    console.log(`Foydalanuvchi chiqib ketdi: ${socket.id}`);
  });
});

server.listen(3001, () => {
  console.log('Professional Server 3001-portda Local MongoDB bilan ishlamoqda 🚀');
});