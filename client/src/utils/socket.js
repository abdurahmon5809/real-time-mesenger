import io from "socket.io-client";
import { SERVER_URL } from "./constants";

export const socket = io(SERVER_URL || undefined, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  auth: { token: localStorage.getItem("chat_token") || "" },
});

export const getPrivateRoomId = (idA, idB) => {
  const [a, b] = [String(idA), String(idB)].sort();
  return `dm:${a}:${b}`;
};
