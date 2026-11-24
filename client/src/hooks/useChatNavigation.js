import { createClientMsgId } from "../utils/ids";

export function useChatNavigation({
  socket,
  activeChatRef,
  currentRoomIdRef,
  currentUserIdRef,
  computeRoomIdForChat,
  bumpRoomGeneration,
  isSessionReady,
  setPendingJoin,
  setChatError,
  setActiveChat,
  setMessages,
  setCurrentRoomId,
  hasMoreMessages,
  isLoadingOlder,
  setHasMoreMessages,
  setIsLoadingOlder,
  joinRequestRef,
  requestOlderMessages,
  messages,
  t,
}) {
  const handleSelectChat = (chat) => {
    setChatError("");
    const prevRoom = currentRoomIdRef.current;
    if (prevRoom && socket.connected) {
      socket.emit("leave_room", { room: prevRoom });
    }

    bumpRoomGeneration();
    activeChatRef.current = chat;
    setActiveChat(chat);
    setMessages([]);
    setHasMoreMessages(false);
    setIsLoadingOlder(false);

    const predictedRoom = computeRoomIdForChat(chat, currentUserIdRef.current);
    currentRoomIdRef.current = predictedRoom;
    setCurrentRoomId(predictedRoom);

    if (socket.connected && isSessionReady()) {
      const requestId = createClientMsgId();
      // requestId is also used to discard late responses from a previously opened chat.
      const expectedRequestId = requestId;
      joinRequestRef.current = expectedRequestId;
      socket.emit(
        "join_room",
        { target: chat.id || chat.name, isGroup: !!chat.isGroup, requestId },
        (res) => {
          if (joinRequestRef.current !== expectedRequestId) return;
          if (res && !res.success) setChatError(res.message || t("joinFailedError"));
        },
      );
    } else {
      setPendingJoin(chat);
    }
  };

  const handleLoadOlder = () => {
    if (isLoadingOlder || !hasMoreMessages || messages.length === 0) return;
    const oldest = messages[0];
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    if (!room) return;

    setIsLoadingOlder(true);
    requestOlderMessages(
      {
        room,
        before: oldest.createdAt || null,
        beforeId: oldest._id || null,
      },
      (res) => {
        setIsLoadingOlder(false);
        if (res?.success && Array.isArray(res.history)) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id || m._id));
            const uniqueOlder = res.history.filter(
              (m) => !existingIds.has(m.id || m._id),
            );
            return [...uniqueOlder, ...prev];
          });
          setHasMoreMessages(!!res.hasMore);
        }
      },
    );
  };


  return { handleSelectChat, handleLoadOlder };
}
