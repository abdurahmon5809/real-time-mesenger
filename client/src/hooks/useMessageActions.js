import { createClientMsgId } from "../utils/ids";

export function useMessageActions({
  socket,
  activeChatRef,
  currentRoomIdRef,
  currentUserIdRef,
  currentUserRef,
  computeRoomIdForChat,
  isSessionReady,
  setMessages,
  setChatError,
  t,
}) {
  const handleSendMessage = ({
    text, file, fileName, fileType, replyTo,
    chat: submittedChat,
    senderId: submittedSenderId,
    sender: submittedSender,
    clientMessageId: suppliedClientMessageId,
  }) => {
    const chat = submittedChat || activeChatRef.current;
    if (!chat) return Promise.resolve({ success: false, message: "Chat tanlanmagan." });
    setChatError("");

    const senderId = submittedSenderId || currentUserIdRef.current;
    const sender = submittedSender || currentUserRef.current;
    if (senderId && String(currentUserIdRef.current) !== String(senderId)) {
      return Promise.resolve({ success: false, silent: true, message: "Akkaunt o‘zgargan." });
    }
    const clientMessageId = suppliedClientMessageId || createClientMsgId();
    const activeChat = activeChatRef.current;
    const isSameActiveChat = Boolean(
      activeChat &&
      String(activeChat.id || activeChat.name) === String(chat.id || chat.name) &&
      Boolean(activeChat.isGroup) === Boolean(chat.isGroup),
    );
    const room = isSameActiveChat && currentRoomIdRef.current
      ? currentRoomIdRef.current
      : computeRoomIdForChat(chat, senderId);
    const isCurrentSendContext = () => {
      const currentRoom = currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      return String(currentUserIdRef.current || "") === String(senderId || "") && currentRoom === room;
    };
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const optimisticMsg = {
      id: clientMessageId,
      clientMessageId,
      room,
      senderId,
      sender,
      receiver: chat.name,
      text: text || "",
      file: file || null,
      fileName: fileName || "",
      fileType: fileType || "",
      time: nowTime,
      isRead: false,
      isEdited: false,
      replyTo: replyTo || null,
      reactions: {},
      pending: true,
    };

    if (isSameActiveChat) setMessages((prev) => [...prev, optimisticMsg]);

    if (!socket.connected || !isSessionReady()) {
      setChatError(t("disconnectedError"));
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      return Promise.resolve({ success: false, message: t("disconnectedError") });
    }

    return new Promise((resolve) => {
      let settled = false;
      const ackTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
        if (!isCurrentSendContext()) {
          resolve({ success: false, silent: true, message: "Chat yoki akkaunt o‘zgargan." });
          return;
        }
        const message = "Serverdan javob kelmadi. Matn qoralamada saqlandi.";
        setChatError(message);
        resolve({ success: false, message });
      }, 15000);
      socket.emit(
      "send_message",
      {
        clientMessageId,
        target: chat.id || chat.name,
        groupId: chat.isGroup ? chat.id : undefined,
        isGroup: !!chat.isGroup,
        text: text || "",
        file: file || null,
        fileName: fileName || "",
        fileType: fileType || "",
        replyTo: replyTo || null,
      },
      (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(ackTimer);
        if (!res?.success) {
          setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
          if (!isCurrentSendContext()) {
            resolve({ success: false, silent: true, message: "Chat yoki akkaunt o‘zgargan." });
            return;
          }
          setChatError(res?.message || t("sendFailedError"));
          resolve({ success: false, message: res?.message || t("sendFailedError") });
          return;
        }
        if (res.message) {
          setMessages((prev) => {
            const activeRoom =
              currentRoomIdRef.current ||
              computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
            // An acknowledgement for chat A must never append into chat B.
            if (
              String(currentUserIdRef.current || "") !== String(senderId || "") ||
              activeRoom !== room ||
              (res.message.room && res.message.room !== room)
            ) return prev;
            const existingIndex = prev.findIndex((message) =>
              message.clientMessageId === clientMessageId ||
              (res.message.id && message.id === res.message.id) ||
              (res.message._id && message._id === res.message._id),
            );
            if (existingIndex >= 0) {
              return prev.map((message, index) =>
                index === existingIndex ? { ...res.message, pending: false } : message,
              );
            }
            // A previous attempt may have been stored by the server while its
            // acknowledgement was lost. The retry uses the same client ID;
            // append the returned canonical message if its optimistic row timed out.
            return [...prev, { ...res.message, pending: false }];
          });
        }
        resolve({ success: true, message: res.message });
      },
    );
    });
  };

  const handleEditMessage = (msgId, newText) => {
    const editOwnerId = currentUserIdRef.current;
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    return new Promise((resolve) => {
      if (!socket.connected || !isSessionReady()) {
        const result = { success: false, message: t("disconnectedError") };
        setChatError(result.message);
        resolve(result);
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const currentRoom = currentRoomIdRef.current ||
          computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
        if (
          String(currentUserIdRef.current || "") !== String(editOwnerId || "") ||
          currentRoom !== room
        ) {
          resolve({ success: false, silent: true, message: "Chat yoki akkaunt o‘zgargan." });
          return;
        }
        const message = "Serverdan javob kelmadi. Tahrir matni saqlab qolindi.";
        setChatError(message);
        resolve({ success: false, message });
      }, 15000);
      socket.emit("edit_message", { msgId, newText, room }, (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!res?.success) {
          const currentRoom = currentRoomIdRef.current ||
            computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
          if (
            String(currentUserIdRef.current || "") !== String(editOwnerId || "") ||
            currentRoom !== room
          ) {
            resolve({ success: false, silent: true, message: "Chat yoki akkaunt o‘zgargan." });
            return;
          }
          setChatError(res?.message || t("sendFailedError"));
          resolve({ success: false, message: res?.message || t("sendFailedError") });
          return;
        }
        resolve({ success: true, message: res.message });
      });
    });
  };

  const handleDeleteMessage = (msgId) => {
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    socket.emit("delete_message", { msgId, room }, (res) => {
      if (!res?.success) {
        setChatError(res?.message || t("sendFailedError"));
      }
    });
  };

  const handleToggleReaction = (msgId, emoji) => {
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    socket.emit("toggle_reaction", { msgId, emoji, room }, (res) => {
      if (!res?.success) {
        setChatError(res?.message || t("sendFailedError"));
      }
    });
  };

  const handleClearChat = () => {
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    if (!room) return;
    socket.emit("clear_chat", { room }, (res) => {
      if (!res?.success) {
        setChatError(res?.message || t("sendFailedError"));
      }
    });
  };


  return {
    handleSendMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleToggleReaction,
    handleClearChat,
  };
}
