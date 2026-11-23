const express = require("express");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const { hashToken, privateRoomId, groupRoomId } = require("./lib/chat-ids");
const { User, Message, Group } = require("./models");
const { router: filesRouter, AVATAR_DIR } = require("./routes/files");
const { setupSocketHandlers } = require("./sockets/handlers");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ limit: "3mb", extended: true }));
app.use("/uploads/avatars", express.static(AVATAR_DIR));
app.use("/api", filesRouter);

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e6,
  cors: { origin: process.env.CLIENT_ORIGIN || "*", methods: ["GET", "POST"] },
});

const DB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/telegram_web_pro";
const PORT = Number(process.env.PORT || 3001);

const { sendDirectory } = setupSocketHandlers(io);
app.locals.sendDirectory = sendDirectory;

async function migrateLegacyData() {
  await mongoose.connect(DB_URI);
  await Message.syncIndexes();

  const users = await User.find({});
  for (const u of users) {
    if (typeof u.avatar === "string" && u.avatar.startsWith("data:")) {
      u.avatar = "";
      await u.save();
    }
  }

  const byName = new Map(users.map((u) => [u.username, u]));
  const groups = await Group.find({});

  for (const group of groups) {
    if (!group.adminId && group.admin && byName.has(group.admin)) {
      group.adminId = byName.get(group.admin)._id;
    }
    if (!group.memberIds?.length) {
      group.memberIds = (group.members || [])
        .map((name) => byName.get(name)?._id)
        .filter(Boolean);
    }
    if (
      group.adminId &&
      !group.memberIds.some((id) => String(id) === String(group.adminId))
    ) {
      group.memberIds.push(group.adminId);
    }
    await group.save();
  }

  const seenMsgIds = new Set();
  const seenClientPairs = new Set();
  const messages = await Message.find({}).sort({ createdAt: 1, _id: 1 });

  for (const msg of messages) {
    const sender = msg.senderId
      ? await User.findById(msg.senderId)
      : byName.get(msg.sender);
    const receiver = msg.receiverId
      ? await User.findById(msg.receiverId)
      : byName.get(msg.receiver);
    if (sender && !msg.senderId) msg.senderId = sender._id;
    if (receiver && !msg.receiverId) msg.receiverId = receiver._id;

    if (!msg.id || seenMsgIds.has(msg.id)) {
      msg.id = crypto.randomUUID();
    }
    seenMsgIds.add(msg.id);

    if (msg.clientMessageId && msg.senderId) {
      const pairKey = `${String(msg.senderId)}:${msg.clientMessageId}`;
      if (seenClientPairs.has(pairKey)) {
        msg.clientMessageId = undefined;
      } else {
        seenClientPairs.add(pairKey);
      }
    }

    if (!msg.room || !msg.room.startsWith("group:")) {
      const group = groups.find((g) => g.name === msg.room);
      if (group) msg.room = groupRoomId(group);
      else if (sender && receiver)
        msg.room = privateRoomId(sender._id, receiver._id);
      else if (msg.room && msg.room.includes("_")) {
        const [aName, bName] = msg.room.split("_");
        const a = byName.get(aName);
        const b = byName.get(bName);
        if (a && b) msg.room = privateRoomId(a._id, b._id);
      }
    }

    if (sender) msg.sender = sender.username;
    if (receiver) msg.receiver = receiver.username;
    await msg.save();
  }

  console.log("Legacy ma’lumotlar migratsiyasi xatosiz yakunlandi.");
  await mongoose.disconnect();
}

if (require.main === module && process.argv.includes("--migrate")) {
  migrateLegacyData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else if (require.main === module) {
  mongoose
    .connect(DB_URI)
    .then(async () => {
      await User.updateMany(
        {},
        { $set: { isOnline: false, socketId: null, socketIds: [] } },
      );
      server.listen(PORT, () =>
        console.log(`Messenger server ${PORT}-portda ishlamoqda.`),
      );
    })
    .catch((error) => {
      console.error("MongoDB ulanishida xatolik:", error);
      process.exit(1);
    });
}

module.exports = { privateRoomId, groupRoomId, hashToken };
