import { useEffect, useRef } from "react";
import { socket } from "../utils/socket";
import { canJoinProtectedRoom } from "../utils/session-gate";

export function useChatSocket({
  activeChat,
  currentUserId,
  soundEnabled,
  onConnectedChange,
  onSessionRestored,
  onSessionExpired,
  onDirectoryUpdate,
  onRoomJoined,
  onLoadHistory,
  onPrependOlderMessages,
  onReceiveMessage,
  onMessageUpdated,
  onMessageDeleted,
  onMessagesRead,
  onChatDeleted,
  onChatCleared,
  onDisplayTyping,
  onHideTyping
}) {
  const activeChatRef = useRef(activeChat);
  const currentUserIdRef = useRef(currentUserId);
  const soundEnabledRef = useRef(soundEnabled);
  const roomGenerationRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const pendingJoinRef = useRef(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const playBeep = () => {
      if (!soundEnabledRef.current) return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(740, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.17);
        setTimeout(() => ctx.close().catch(() => {}), 250);
      } catch {
        // Ignore audio autoplay restrictions
      }
    };

    const handleConnect = () => {
      onConnectedChange?.(true);
      // Socket.IO connect does not mean that the application session has been
      // restored. Wait for session_restored before joining a protected room.
      sessionReadyRef.current = false;
      // A chat selected while reconnecting is newer than the last rendered
      // activeChat prop; do not overwrite that pending selection here.
      pendingJoinRef.current = pendingJoinRef.current || activeChatRef.current;
    };

    const handleDisconnect = () => {
      sessionReadyRef.current = false;
      onConnectedChange?.(false);
    };

    const handleConnectError = (err) => {
      sessionReadyRef.current = false;
      onConnectedChange?.(false);
      if (err && (err.message === "SESSION_INVALID" || err.message === "AUTH_CHECK_FAILED")) {
        pendingJoinRef.current = null;
        onSessionExpired?.("Sessiya muddati tugagan yoki noto‘g‘ri. Qayta kiring.");
      }
    };

    const handleSessionRestored = (payload) => {
      sessionReadyRef.current = true;
      const chat = pendingJoinRef.current || activeChatRef.current;
      pendingJoinRef.current = null;
      if (canJoinProtectedRoom(socket.connected, sessionReadyRef.current) && chat && (chat.id || chat.name)) {
        roomGenerationRef.current += 1;
        const requestId = `${Date.now()}-${roomGenerationRef.current}`;
        onSessionRestored?.(payload?.user, requestId);
        socket.emit("join_room", {
          target: chat.id || chat.name,
          isGroup: !!chat.isGroup,
          requestId,
        });
      } else {
        onSessionRestored?.(payload?.user, null);
      }
    };

    const handleSessionExpired = (payload) => {
      sessionReadyRef.current = false;
      pendingJoinRef.current = null;
      onConnectedChange?.(false);
      onSessionExpired?.(payload?.message || "Sessiya yakunlandi. Qayta kiring.");
    };

    const handleDirectory = (payload) => {
      onDirectoryUpdate?.(payload);
    };

    const handleRoomJoined = (payload) => {
      if (!sessionReadyRef.current) return;
      onRoomJoined?.(payload);
    };

    const handleLoadHistory = (payload) => {
      if (!sessionReadyRef.current) return;
      const gen = roomGenerationRef.current;
      onLoadHistory?.(payload, gen);
    };

    const handleReceiveMessage = (msg) => {
      if (!msg) return;
      const myId = currentUserIdRef.current;
      const isFromMe = myId && msg.senderId && String(msg.senderId) === String(myId);
      if (!isFromMe) {
        playBeep();
      }
      onReceiveMessage?.(msg);
    };

    const handleMessageUpdated = (payload) => {
      onMessageUpdated?.(payload);
    };

    const handleMessageDeleted = (payload) => {
      onMessageDeleted?.(payload);
    };

    const handleMessagesRead = (payload) => {
      onMessagesRead?.(payload);
    };

    const handleChatDeleted = (payload) => {
      onChatDeleted?.(payload);
    };

    const handleChatCleared = (payload) => {
      onChatCleared?.(payload);
    };

    const handleDisplayTyping = (payload) => {
      onDisplayTyping?.(payload);
    };

    const handleHideTyping = (payload) => {
      onHideTyping?.(payload);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("session_restored", handleSessionRestored);
    socket.on("session_expired", handleSessionExpired);
    socket.on("update_users_and_groups", handleDirectory);
    socket.on("room_joined", handleRoomJoined);
    socket.on("load_history", handleLoadHistory);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("messages_read", handleMessagesRead);
    socket.on("chat_deleted", handleChatDeleted);
    socket.on("chat_cleared", handleChatCleared);
    socket.on("display_typing", handleDisplayTyping);
    socket.on("hide_typing", handleHideTyping);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("session_restored", handleSessionRestored);
      socket.off("session_expired", handleSessionExpired);
      socket.off("update_users_and_groups", handleDirectory);
      socket.off("room_joined", handleRoomJoined);
      socket.off("load_history", handleLoadHistory);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("messages_read", handleMessagesRead);
      socket.off("chat_deleted", handleChatDeleted);
      socket.off("chat_cleared", handleChatCleared);
      socket.off("display_typing", handleDisplayTyping);
      socket.off("hide_typing", handleHideTyping);
    };
  }, []);

  const requestOlderMessages = ({ room, before, beforeId }, callback) => {
    const gen = roomGenerationRef.current;
    socket.emit("load_older_messages", { room, before, beforeId }, (res) => {
      if (gen !== roomGenerationRef.current) return;
      callback?.(res);
    });
  };

  const bumpRoomGeneration = () => {
    roomGenerationRef.current += 1;
    return roomGenerationRef.current;
  };

  const isSessionReady = () => sessionReadyRef.current;
  const setPendingJoin = (chat) => { pendingJoinRef.current = chat || null; };

  return {
    roomGenerationRef,
    bumpRoomGeneration,
    requestOlderMessages,
    isSessionReady,
    setPendingJoin
  };
}