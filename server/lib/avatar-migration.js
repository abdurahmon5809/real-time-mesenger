const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

async function migrateLegacyAvatar(user, avatarDir) {
  if (typeof user.avatar !== "string" || !user.avatar.startsWith("data:")) return false;
  const match = user.avatar.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    console.warn(`Legacy avatar for user ${user._id} has unsupported data URI; kept unchanged.`);
    return false;
  }

  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
    console.warn(`Legacy avatar for user ${user._id} exceeds allowed size; kept unchanged.`);
    return false;
  }
  const signatures = {
    "image/jpeg": bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/png": bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/gif": bytes.subarray(0, 4).toString() === "GIF8",
    "image/webp": bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
  };
  if (!signatures[mime]) {
    console.warn(`Legacy avatar for user ${user._id} failed signature validation; kept unchanged.`);
    return false;
  }

  const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" }[mime];
  const name = `${crypto.randomUUID()}${extension}`;
  const target = path.join(avatarDir, name);
  fs.mkdirSync(avatarDir, { recursive: true });
  fs.writeFileSync(target, bytes, { flag: "wx" });

  const previous = user.avatar;
  try {
    user.avatar = `/uploads/avatars/${name}`;
    await user.save();
    return true;
  } catch (error) {
    user.avatar = previous;
    try { fs.unlinkSync(target); } catch {}
    throw error;
  }
}

module.exports = { migrateLegacyAvatar };
