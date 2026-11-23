const mongoose = require("mongoose");

const DEFAULT_BIO = "Hey there! I am using Telegram Web Pro.";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 32,
    },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    bio: { type: String, default: DEFAULT_BIO },
    isOnline: { type: Boolean, default: false },
    socketId: { type: String, default: null },
    socketIds: { type: [String], default: [] },
    // Guruh bo'yicha oxirgi o'qilgan vaqt (groupId -> Date)
    groupReadAt: { type: Map, of: Date, default: {} },
  },
  { timestamps: true },
);
const User = mongoose.model("User", userSchema);

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, unique: true, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
const Session = mongoose.model("Session", sessionSchema);

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    clientMessageId: { type: String, index: true },
    room: { type: String, required: true, index: true },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    sender: String,
    receiver: String,
    text: String,
    file: String,
    fileName: String,
    fileType: String,
    time: String,
    isRead: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    replyTo: mongoose.Schema.Types.Mixed,
    reactions: { type: Map, of: [String], default: {} },
  },
  { timestamps: true },
);
messageSchema.index({ room: 1, createdAt: -1, _id: -1 });
messageSchema.index({ room: 1, senderId: 1, createdAt: -1 });
messageSchema.index(
  { senderId: 1, clientMessageId: 1 },
  { unique: true, sparse: true },
);
const Message = mongoose.model("Message", messageSchema);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    admin: String,
    members: [String],
    avatar: { type: String, default: "" },
  },
  { timestamps: true },
);
const Group = mongoose.model("Group", groupSchema);

const uploadedFileSchema = new mongoose.Schema(
  {
    fileId: { type: String, unique: true, required: true },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    room: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    storageName: { type: String, required: true },
    attached: { type: Boolean, default: false },
  },
  { timestamps: true },
);
const UploadedFile = mongoose.model("UploadedFile", uploadedFileSchema);

module.exports = { User, Session, Message, Group, UploadedFile, DEFAULT_BIO };
