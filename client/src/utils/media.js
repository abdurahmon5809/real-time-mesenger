import { API_URL } from "./constants";

export const resolveAvatar = (av) => {
  if (!av || typeof av !== "string") return "";
  const trimmed = av.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return "";
  if (trimmed.startsWith("/uploads/avatars/")) return `${API_URL}${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "";
};

export const getInitials = (name) => {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : String(name).slice(0, 2).toUpperCase();
};

export const getAvatarColor = (name) => {
  const colors = ["#5bc0eb", "#fde74c", "#9bc53d", "#e55934", "#fa7921", "#a288e3", "#4ea8de", "#48bfe3"];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};