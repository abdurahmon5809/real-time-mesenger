const express = require("express");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
// Migrations must normalize legacy rows before MongoDB builds unique indexes.
mongoose.set("autoIndex", false);
const { hashToken, privateRoomId, groupRoomId } = require("./lib/chat-ids");
const { User, Session, Message, Group, UploadedFile } = require("./models");
const { router: filesRouter, AVATAR_DIR } = require("./routes/files");
const { setupSocketHandlers } = require("./sockets/handlers");
const { migrateReactionOwners } = require("./lib/legacy-reactions");
const { dedupeLegacyMessageIdentity } = require("./lib/legacy-message-ids");
const { migrateLegacyAvatar } = require("./lib/avatar-migration");
const { dropLegacySparseClientMessageIndex } = require("./lib/message-index-migration");

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

const ensureIndexes = async () => {
  await Promise.all([
    User.createIndexes(), Session.createIndexes(), Message.createIndexes(),
    Group.createIndexes(), UploadedFile.createIndexes(),
  ]);
};

const { sendDirectory } = setupSocketHandlers(io);
app.locals.sendDirectory = sendDirectory;

async function migrateLegacyData({ connect = true, disconnect = true } = {}) {
  if (connect) await mongoose.connect(DB_URI);

  // Drop only the old sparse compound index. It can index historical rows
  // that have senderId but no clientMessageId. Keep the message-id index intact.
  await dropLegacySparseClientMessageIndex(Message.collection);

  const users = await User.find({});
  for (const u of users) await migrateLegacyAvatar(u, AVATAR_DIR);
  const byName = new Map(users.map((u) => [u.username, u]));
  const byId = new Map(users.map((u) => [String(u._id).toLowerCase(), u]));
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

    dedupeLegacyMessageIdentity(msg, seenMsgIds, seenClientPairs, () => crypto.randomUUID());

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

    // Legacy reactions stored usernames. Convert only exact, uniquely-resolved
    // usernames to immutable user IDs; unknown values are retained for audit.
    if (msg.reactions) {
      const { migrated, unresolved } = migrateReactionOwners(msg.reactions, byName, byId);
      msg.reactions = migrated;
      if (unresolved.length) {
        msg.legacyReactionsUnresolved = [
          ...(msg.legacyReactionsUnresolved || []),
          ...unresolved,
        ];
        console.warn(`Message ${msg._id}: ${unresolved.length} legacy reaction owner(s) were quarantined for manual review.`);
      }
    }
    await msg.save();
  }

  await ensureIndexes();
  console.log("Legacy ma’lumotlar migratsiyasi yakunlandi. Eski avatarlar va reaksiyalar saqlangan holda tekshirildi.");
  if (disconnect) await mongoose.disconnect();
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
      // Normalize old documents before unique indexes are created on startup.
      await migrateLegacyData({ connect: false, disconnect: false });
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

module.exports = { privateRoomId, groupRoomId, hashToken, migrateLegacyData };
