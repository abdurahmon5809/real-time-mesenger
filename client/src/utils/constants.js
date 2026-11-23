export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
export const DEFAULT_BIO = "Hey there! I am using Telegram Web Pro.";
export const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
