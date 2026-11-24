const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { User, Session, Message, Group, UploadedFile } = require("../models");
const { hashToken, privateRoomId, groupRoomId } = require("../lib/chat-ids");

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const validId = (value) => mongoose.isValidObjectId(String(value || ""));

const httpSessionUser = async (req) => {
  const token = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return null;
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return session ? User.findById(session.userId) : null;
};

const verifyMagicBytes = (mime, bytes) => {
  const signatures = {
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/gif": bytes.subarray(0, 4).toString() === "GIF8",
    "image/webp":
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP",
    "application/pdf": bytes.subarray(0, 5).toString() === "%PDF-",
    "application/zip": bytes
      .subarray(0, 4)
      .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    "text/plain": !bytes.includes(0),
  };
  return !!signatures[mime];
};

router.post(
  "/avatar",
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  async (req, res) => {
    try {
      const user = await httpSessionUser(req);
      if (!user) {
        return res
          .status(401)
          .json({
            success: false,
            code: "SESSION_INVALID",
            message: "Login talab qilinadi.",
          });
      }
      const mime = String(req.headers["x-file-type"] || "");
      if (!ALLOWED_AVATAR_TYPES.has(mime)) {
        return res.status(415).json({
          success: false,
          code: "INVALID_AVATAR_TYPE",
          message: "Avatar faqat rasm (JPG, PNG, GIF, WEBP) bo‘lishi kerak.",
        });
      }
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.length ||
        req.body.length > 10 * 1024 * 1024
      ) {
        return res.status(400).json({
          success: false,
          code: "INVALID_AVATAR_SIZE",
          message: "Rasm bo‘sh yoki 10 MB dan katta bo‘lmasligi kerak.",
        });
      }
      if (!verifyMagicBytes(mime, req.body)) {
        return res.status(415).json({
          success: false,
          code: "INVALID_FILE_SIGNATURE",
          message: "Fayl tarkibi rasm formatiga mos emas.",
        });
      }

      const extMap = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
      };
      const avatarId = crypto.randomUUID();
      const storageName = `${avatarId}${extMap[mime] || ".png"}`;
      fs.writeFileSync(path.join(AVATAR_DIR, storageName), req.body, {
        flag: "wx",
      });

      const oldAvatar = user.avatar;
      const avatarUrl = `/uploads/avatars/${storageName}`;
      try {
        user.avatar = avatarUrl;
        await user.save();
      } catch (saveError) {
        try { fs.unlinkSync(path.join(AVATAR_DIR, storageName)); } catch {}
        user.avatar = oldAvatar;
        throw saveError;
      }

      // Remove the previous file only after the new file and DB update succeeded.
      if (oldAvatar && oldAvatar.startsWith("/uploads/avatars/")) {
        const oldPath = path.join(AVATAR_DIR, path.basename(oldAvatar));
        if (oldPath !== path.join(AVATAR_DIR, storageName) && fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (cleanupError) {
            console.warn("Old avatar cleanup failed:", cleanupError.message);
          }
        }
      }

      if (req.app.locals.sendDirectory) {
        await req.app.locals.sendDirectory();
      }

      res.status(201).json({ success: true, avatar: avatarUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res
        .status(500)
        .json({
          success: false,
          code: "AVATAR_UPLOAD_FAILED",
          message: "Avatarni saqlab bo‘lmadi.",
        });
    }
  },
);

router.post(
  "/files",
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  async (req, res) => {
    try {
      const user = await httpSessionUser(req);
      if (!user) {
        return res
          .status(401)
          .json({
            success: false,
            code: "SESSION_INVALID",
            message: "Login talab qilinadi.",
          });
      }
      const mime = String(
        req.headers["x-file-type"] || "application/octet-stream",
      );
      if (!ALLOWED_FILE_TYPES.has(mime)) {
        return res
          .status(415)
          .json({
            success: false,
            code: "UNSUPPORTED_FILE_TYPE",
            message: "Bu fayl turi ruxsat etilmagan.",
          });
      }
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.length ||
        req.body.length > 10 * 1024 * 1024
      ) {
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_FILE_SIZE",
            message: "Fayl bo‘sh yoki 10 MB dan katta.",
          });
      }
      if (!verifyMagicBytes(mime, req.body)) {
        return res
          .status(415)
          .json({
            success: false,
            code: "INVALID_FILE_SIGNATURE",
            message: "Fayl tarkibi e’lon qilingan turga mos emas.",
          });
      }

      const target = String(req.headers["x-chat-target"] || "");
      const isGroup = String(req.headers["x-chat-group"] || "") === "true";
      let roomId;
      if (isGroup) {
        if (!validId(target)) {
          return res
            .status(400)
            .json({
              success: false,
              code: "INVALID_GROUP_ID",
              message: "Guruh ID noto‘g‘ri.",
            });
        }
        const group = await Group.findById(target);
        if (
          !group ||
          !(group.memberIds || []).some((id) => String(id) === String(user._id))
        ) {
          return res
            .status(403)
            .json({
              success: false,
              code: "FORBIDDEN_GROUP",
              message: "Guruhga ruxsat yo‘q.",
            });
        }
        roomId = groupRoomId(group);
      } else {
        const recipient = await User.findOne(
          validId(target) ? { _id: target } : { username: target },
        );
        if (!recipient || String(recipient._id) === String(user._id)) {
          return res
            .status(404)
            .json({
              success: false,
              code: "CHAT_NOT_FOUND",
              message: "Chat topilmadi.",
            });
        }
        roomId = privateRoomId(user._id, recipient._id);
      }

      const fileId = crypto.randomUUID();
      const rawFileName = decodeURIComponent(
        String(req.headers["x-file-name"] || "file"),
      );
      const fileName = rawFileName.replace(/[\\/\0]/g, "_").slice(0, 180);
      const extension = path.extname(fileName).slice(0, 12);
      const storageName = `${fileId}${extension}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, storageName), req.body, {
        flag: "wx",
      });

      await UploadedFile.create({
        fileId,
        ownerId: user._id,
        room: roomId,
        fileName,
        fileType: mime,
        storageName,
      });

      const fileUrl = `/api/files/${fileId}`;
      res
        .status(201)
        .json({
          success: true,
          file: fileUrl,
          fileName,
          fileType: mime,
          size: req.body.length,
          room: roomId,
        });
    } catch (error) {
      console.error("Upload error:", error);
      res
        .status(500)
        .json({
          success: false,
          code: "FILE_UPLOAD_FAILED",
          message: "Faylni saqlab bo‘lmadi.",
        });
    }
  },
);

router.get("/files/:fileId", async (req, res) => {
  try {
    const user = await httpSessionUser(req);
    if (!user) {
      return res
        .status(401)
        .json({
          success: false,
          code: "SESSION_INVALID",
          message: "Login talab qilinadi.",
        });
    }
    const msg = await Message.findOne({
      file: `/api/files/${req.params.fileId}`,
    });
    if (!msg)
      return res
        .status(404)
        .json({
          success: false,
          code: "FILE_NOT_FOUND",
          message: "Fayl topilmadi.",
        });

    let allowed =
      String(msg.senderId) === String(user._id) ||
      String(msg.receiverId) === String(user._id);
    if (!allowed && msg.room.startsWith("group:")) {
      const group = await Group.findById(msg.room.slice(6));
      allowed =
        !!group &&
        (group.memberIds || []).some((id) => String(id) === String(user._id));
    }
    if (!allowed)
      return res
        .status(403)
        .json({
          success: false,
          code: "FORBIDDEN_FILE",
          message: "Faylni olish huquqingiz yo‘q.",
        });

    const diskFile = fs
      .readdirSync(UPLOAD_DIR)
      .find(
        (name) =>
          name.startsWith(`${req.params.fileId}.`) ||
          name === req.params.fileId,
      );
    if (!diskFile)
      return res
        .status(404)
        .json({
          success: false,
          code: "FILE_MISSING",
          message: "Fayl serverda topilmadi.",
        });
    res.download(path.join(UPLOAD_DIR, diskFile), msg.fileName || "download");
  } catch (error) {
    console.error("Download error:", error);
    res
      .status(500)
      .json({
        success: false,
        code: "FILE_DOWNLOAD_FAILED",
        message: "Faylni yuklab bo‘lmadi.",
      });
  }
});

module.exports = { router, AVATAR_DIR };
