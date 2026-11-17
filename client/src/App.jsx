import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import {
  SERVER_URL,
  MAX_FILE_SIZE_BYTES,
  translations,
} from "./utils/constants";
import { socket } from "./utils/socket";
import AuthScreen from "./components/AuthScreen";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import Modals from "./components/Modals";

function App() {
  const [username, setUsername] = useState(
    () => localStorage.getItem("chat_username") || ""
  );
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [typingStatus, setTypingStatus] = useState("");
  const [typingUsers, setTypingUsers] = useState({});
  const [replyingToMsg, setReplyingToMsg] = useState(null);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
  const [privateFileUrls, setPrivateFileUrls] = useState({});
  const [chatSummaries, setChatSummaries] = useState({});

  const [theme, setTheme] = useState(
    () => localStorage.getItem("chat_theme") || "dark"
  );
  const [language, setLanguage] = useState(
    () => localStorage.getItem("chat_lang") || "uz"
  );
  const [notifications, setNotifications] = useState(
    () => localStorage.getItem("chat_notif") !== "false"
  );
  const [wallpaper, setWallpaper] = useState(
    () => localStorage.getItem("chat_wp") || "doodle"
  );
  const [hiddenChats, setHiddenChats] = useState(() => {
    const saved = localStorage.getItem("chat_hidden");
    return saved ? JSON.parse(saved) : [];
  });

  const [newUsername, setNewUsername] = useState(username);
  const [bio, setBio] = useState(
    () =>
      localStorage.getItem("chat_bio") ||
      "Hey there! I am using Telegram Web Pro."
  );
  // Rule 12: Do not store Base64 avatars in localStorage; keep URL or in-memory state
  const [avatar, setAvatar] = useState("");
  const [activeMedia, setActiveMedia] = useState(null);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const clientTypingTimeoutRef = useRef(null);
  const activeChatRef = useRef(activeChat);
  const usernameRef = useRef(username);
  const userIdRef = useRef(userId);
  const draftsRef = useRef({});
  const pendingIdsRef = useRef({});
  const seenMessageIdsRef = useRef(new Set());
  const hasMoreHistoryRef = useRef(true);
  const loadingOlderRef = useRef(false);

  const t = translations[language] || translations.uz;

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    // Clean up any legacy base64 avatar stored in localStorage (Rule 12)
    if (localStorage.getItem("chat_avatar")) {
      localStorage.removeItem("chat_avatar");
    }
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setShowEmojiPicker(false);
        setReactionPickerMsgId(null);
        if (activeMedia) setActiveMedia(null);
        else if (isProfileOpen) setIsProfileOpen(false);
        else if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isCreateGroupOpen) setIsCreateGroupOpen(false);
        else if (editingMsgId) {
          setEditingMsgId(null);
          setMessage("");
        } else if (replyingToMsg) setReplyingToMsg(null);
        else if (activeChat) closeActiveChat();
      }
    };
    const handleClickOutside = () => {
      setContextMenu(null);
      setReactionPickerMsgId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [
    activeMedia,
    isProfileOpen,
    isSettingsOpen,
    isCreateGroupOpen,
    editingMsgId,
    replyingToMsg,
    activeChat,
  ]);

  useEffect(() => {
    localStorage.setItem("chat_theme", theme);
    localStorage.setItem("chat_lang", language);
    localStorage.setItem("chat_bio", bio);
    localStorage.setItem("chat_notif", notifications);
    localStorage.setItem("chat_wp", wallpaper);
    localStorage.setItem("chat_hidden", JSON.stringify(hiddenChats));
  }, [theme, language, bio, notifications, wallpaper, hiddenChats]);

  const resetToLogin = () => {
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_username");
    socket.auth = { token: "" };
    setIsLoggedIn(false);
    setUserId("");
    setUsername("");
    setPassword("");
    setAvatar("");
    setActiveChat(null);
    activeChatRef.current = null;
    setMessages([]);
    setChatSummaries({});
    draftsRef.current = {};
    pendingIdsRef.current = {};
  };

  useEffect(() => {
    const onSessionRestored = ({ user }) => {
      if (!user) return;
      setUsername(user.username);
      setUserId(user.id || user.userId || "");
      setNewUsername(user.username);
      setAvatar(user.avatar || "");
      setBio(user.bio || "");
      setIsLoggedIn(true);
      localStorage.setItem("chat_username", user.username);
    };

    // Rule 4: Force logout & return to login screen when session expires/invalidated
    const onSessionExpired = () => {
      resetToLogin();
      socket.disconnect();
      socket.connect();
    };

    const onDirectory = ({ users, groups, summaries }) => {
      setAllUsers(users || []);
      setAllGroups(groups || []);
      if (summaries) {
        setChatSummaries((prev) => ({ ...prev, ...summaries }));
      }
    };

    const onGroups = (groups) => setAllGroups(groups || []);

    const onRoomJoined = ({ room, target, targetId }) => {
      const current = activeChatRef.current;
      if (
        current &&
        ((targetId && String(current.id) === String(targetId)) ||
          !target ||
          current.name === target)
      ) {
        const next = { ...current, roomId: room };
        activeChatRef.current = next;
        setActiveChat(next);
      }
    };

    // Rule 7: Ignore delayed history belonging to a previously opened chat
    const onHistory = ({ room, history }) => {
      if (!activeChatRef.current || activeChatRef.current.roomId !== room) {
        return;
      }
      hasMoreHistoryRef.current = (history || []).length === 50;
      setChatSummaries((prev) => ({
        ...prev,
        [room]: { ...(prev[room] || {}), unreadCount: 0 },
      }));
      setMessages(history || []);
      const meId = String(userIdRef.current);
      const lastIncoming = [...(history || [])]
        .reverse()
        .find((m) => String(m.receiverId) === meId && !m.isRead);
      if (lastIncoming) {
        socket.emit("mark_read", { room, upToMessageId: lastIncoming.id });
      }
    };

    const onReceiveMessage = (data) => {
      if (!data) return;
      const isDuplicate = data.id && seenMessageIdsRef.current.has(data.id);
      if (data.id) {
        seenMessageIdsRef.current.add(data.id);
        if (seenMessageIdsRef.current.size > 5000) {
          seenMessageIdsRef.current.clear();
        }
      }
      const meId = String(userIdRef.current);
      const isActiveRoom = activeChatRef.current?.roomId === data.room;

      // Update sidebar last message, time & unread count (Rule 11)
      setChatSummaries((prev) => {
        const currentSummary = prev[data.room] || { unreadCount: 0 };
        const increment =
          !isDuplicate && !isActiveRoom && String(data.senderId) !== meId
            ? 1
            : 0;
        return {
          ...prev,
          [data.room]: {
            lastMessage: data,
            unreadCount: isActiveRoom
              ? 0
              : (currentSummary.unreadCount || 0) + increment,
          },
        };
      });

      if (isDuplicate) return;

      if (isActiveRoom) {
        setMessages((list) =>
          list.some((item) => item.id === data.id) ? list : [...list, data]
        );
        if (String(data.receiverId) === meId && !data.isRead) {
          socket.emit("mark_read", { room: data.room, upToMessageId: data.id });
        }
      }

      setHiddenChats((prev) =>
        prev.filter((name) => name !== data.sender && name !== data.receiver)
      );
      setTypingStatus("");

      if (
        notifications &&
        String(data.senderId) !== meId &&
        data.sender !== usernameRef.current &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification(String(data.sender || "Yangi xabar"), {
          body: data.file ? "📎 Fayl yuborildi" : data.text,
        });
      }
    };

    const onMessageUpdated = ({ room, message: updatedMsg }) => {
      if (activeChatRef.current?.roomId === room) {
        setMessages((list) =>
          list.map((item) => (item.id === updatedMsg.id ? updatedMsg : item))
        );
      }
      setChatSummaries((prev) => {
        if (prev[room]?.lastMessage?.id === updatedMsg.id) {
          return {
            ...prev,
            [room]: { ...prev[room], lastMessage: updatedMsg },
          };
        }
        return prev;
      });
    };

    const onMessageDeleted = ({ room, msgId }) => {
      if (activeChatRef.current?.roomId === room) {
        setMessages((list) => list.filter((item) => item.id !== msgId));
      }
    };

    const onMessagesRead = ({ room, readerId, upToMessageId }) => {
      const meId = String(userIdRef.current);
      if (activeChatRef.current?.roomId === room) {
        setMessages((list) => {
          const boundaryMsg = upToMessageId
            ? list.find((x) => x.id === upToMessageId)
            : null;
          return list.map((m) => {
            if (
              String(m.senderId) === meId &&
              String(readerId) !== meId &&
              (!boundaryMsg ||
                m.createdAt < boundaryMsg.createdAt ||
                (m.createdAt === boundaryMsg.createdAt &&
                  String(m._id || m.id) <=
                    String(boundaryMsg._id || boundaryMsg.id)))
            ) {
              return { ...m, isRead: true };
            }
            return m;
          });
        });
      }
    };

    const onTyping = ({ username: typingUser, userId: typingUserId, room }) => {
      if (activeChatRef.current?.roomId === room) {
        setTypingStatus(`${typingUser} ${t.typing}`);
      }
      setTypingUsers((prev) => ({
        ...prev,
        [typingUserId || typingUser]: true,
        [typingUser]: true,
      }));
    };

    const onStopTyping = ({
      username: typingUser,
      userId: typingUserId,
      room,
    }) => {
      if (activeChatRef.current?.roomId === room) setTypingStatus("");
      setTypingUsers((prev) => {
        const updated = { ...prev };
        if (typingUserId) delete updated[typingUserId];
        delete updated[typingUser];
        return updated;
      });
    };

    // Rule 14: Close group window across all tabs if removed/left/deleted
    const onChatDeleted = ({ room } = {}) => {
      if (!room || activeChatRef.current?.roomId === room) {
        setMessages([]);
        setActiveChat(null);
        activeChatRef.current = null;
      }
      if (room) {
        setChatSummaries((prev) => {
          const copy = { ...prev };
          delete copy[room];
          return copy;
        });
      }
    };

    const onConnectError = (error) => {
      if (
        error?.message === "SESSION_INVALID" &&
        localStorage.getItem("chat_token")
      ) {
        onSessionExpired();
      }
    };

    // Rule 1: Automatically restore open chat upon socket reconnect
    const onSocketConnect = () => {
      const current = activeChatRef.current;
      if (!current) return;
      socket.emit(
        "join_room",
        {
          target: current.isGroup ? current.id : current.id || current.name,
          isGroup: !!current.isGroup,
        },
        (res) => {
          if (res?.success) {
            const next = { ...current, roomId: res.room };
            activeChatRef.current = next;
            setActiveChat(next);
          } else if (res?.code === "SESSION_INVALID") {
            onSessionExpired();
          }
        }
      );
    };

    socket.on("connect", onSocketConnect);
    socket.on("connect_error", onConnectError);
    socket.on("session_restored", onSessionRestored);
    socket.on("session_expired", onSessionExpired);
    socket.on("update_users_and_groups", onDirectory);
    socket.on("group_created", onGroups);
    socket.on("room_joined", onRoomJoined);
    socket.on("load_history", onHistory);
    socket.on("receive_message", onReceiveMessage);
    socket.on("messages_read", onMessagesRead);
    socket.on("message_updated", onMessageUpdated);
    socket.on("message_deleted", onMessageDeleted);
    socket.on("display_typing", onTyping);
    socket.on("hide_typing", onStopTyping);
    socket.on("chat_deleted", onChatDeleted);
    socket.connect();

    return () => {
      socket.off("connect", onSocketConnect);
      socket.off("connect_error", onConnectError);
      socket.off("session_restored", onSessionRestored);
      socket.off("session_expired", onSessionExpired);
      socket.off("update_users_and_groups", onDirectory);
      socket.off("group_created", onGroups);
      socket.off("room_joined", onRoomJoined);
      socket.off("load_history", onHistory);
      socket.off("receive_message", onReceiveMessage);
      socket.off("messages_read", onMessagesRead);
      socket.off("message_updated", onMessageUpdated);
      socket.off("message_deleted", onMessageDeleted);
      socket.off("display_typing", onTyping);
      socket.off("hide_typing", onStopTyping);
      socket.off("chat_deleted", onChatDeleted);
    };
  }, [notifications, t.typing]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Rule 8: Cursor pagination using both createdAt and message ID so no messages are skipped or duplicated
  const handleMessagesScroll = (e) => {
    const node = e.target;
    if (
      node.scrollTop === 0 &&
      hasMoreHistoryRef.current &&
      !loadingOlderRef.current &&
      activeChatRef.current?.roomId
    ) {
      loadingOlderRef.current = true;
      const oldestMsg = messages[0];
      if (!oldestMsg) {
        loadingOlderRef.current = false;
        return;
      }
      const requestedRoom = activeChatRef.current.roomId;
      socket.emit(
        "load_older_messages",
        {
          room: requestedRoom,
          before: oldestMsg.createdAt,
          beforeId: oldestMsg._id || oldestMsg.id,
        },
        (res) => {
          loadingOlderRef.current = false;
          if (activeChatRef.current?.roomId !== requestedRoom) return;
          if (res?.success && res.history?.length) {
            hasMoreHistoryRef.current = res.hasMore;
            const prevScrollHeight = node.scrollHeight;
            setMessages((list) => {
              const existingIds = new Set(list.map((m) => m.id));
              const uniqueOlder = res.history.filter(
                (m) => !existingIds.has(m.id)
              );
              return [...uniqueOlder, ...list];
            });
            requestAnimationFrame(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop =
                  messagesContainerRef.current.scrollHeight - prevScrollHeight;
              }
            });
          } else {
            hasMoreHistoryRef.current = false;
          }
        }
      );
    }
  };

  const closeActiveChat = () => {
    if (activeChat?.id) {
      const chatKey = `${activeChat.isGroup ? "g" : "u"}:${activeChat.id}`;
      draftsRef.current[chatKey] = message;
    }
    if (activeChat?.roomId) {
      socket.emit("stop_typing", { room: activeChat.roomId });
      socket.emit("leave_room", { room: activeChat.roomId });
    }
    setActiveChat(null);
    activeChatRef.current = null;
    setMessages([]);
    setEditingMsgId(null);
    setReplyingToMsg(null);
    setMessage("");
  };

  const handleAuth = (e) => {
    e.preventDefault();
    setAuthError("");
    const eventName = isRegistering ? "register" : "login";
    socket.emit(eventName, { username: username.trim(), password }, (res) => {
      if (!res || !res.success) {
        setAuthError(res?.message || "Kirishda xatolik yuz berdi.");
        return;
      }
      if (!res.token) {
        setAuthError("Server xavfsiz sessiya tokenini qaytarmadi.");
        return;
      }
      localStorage.setItem("chat_token", res.token);
      localStorage.setItem("chat_username", res.user.username);
      socket.auth = { token: res.token };
      setUsername(res.user.username);
      setUserId(res.user.id || res.user.userId || "");
      setIsLoggedIn(true);
      setNewUsername(res.user.username);
      setAvatar(res.user.avatar || "");
      setBio(res.user.bio || "");
      socket.disconnect();
      socket.connect();
    });
  };

  const handleLogout = () => {
    const finishLogout = () => {
      resetToLogin();
      socket.disconnect();
      socket.connect();
    };
    if (socket.connected) socket.emit("logout", {}, finishLogout);
    else finishLogout();
  };

  // Rule 5: Server sends ack first, then disconnects; frontend cleans up state cleanly
  const handleDeleteAccount = () => {
    if (
      window.confirm(
        "Diqqat! Akkauntingiz va barcha xabarlaringiz butunlay o'chib ketadi. Rozimisiz?"
      )
    ) {
      socket.emit("delete_account", {}, (res) => {
        if (res?.success) {
          resetToLogin();
          socket.disconnect();
          socket.connect();
        } else {
          alert(res?.message || "Akkauntni o‘chirishda xatolik!");
        }
      });
    }
  };

  const handleSelectChat = (chatItem, isGroup = false) => {
    // Save current draft before switching chat (Rule 2)
    if (activeChat?.id && !editingMsgId) {
      const prevKey = `${activeChat.isGroup ? "g" : "u"}:${activeChat.id}`;
      draftsRef.current[prevKey] = message;
    }

    if (activeChat?.roomId) {
      socket.emit("stop_typing", { room: activeChat.roomId });
      socket.emit("leave_room", { room: activeChat.roomId });
    }

    const chatName = chatItem.name || chatItem.username;
    const targetId = chatItem.id || chatItem.groupId || chatItem.userId;
    setHiddenChats((prev) => prev.filter((n) => n !== chatName));

    const chatData = {
      name: chatName,
      id: targetId,
      isGroup,
      avatar: chatItem.avatar || "",
      roomId: null,
    };
    activeChatRef.current = chatData;
    setActiveChat(chatData);
    setMessages([]);
    hasMoreHistoryRef.current = true;
    loadingOlderRef.current = false;

    const nextKey = `${isGroup ? "g" : "u"}:${targetId}`;
    setMessage(draftsRef.current[nextKey] || "");
    setTypingStatus("");
    setEditingMsgId(null);
    setReplyingToMsg(null);

    socket.emit(
      "join_room",
      { target: targetId || chatName, isGroup },
      (res) => {
        // Ignore stale join response if user already switched to another chat (Rule 7)
        if (
          activeChatRef.current?.id !== targetId ||
          activeChatRef.current?.isGroup !== isGroup
        ) {
          return;
        }
        if (!res?.success) {
          setActiveChat(null);
          activeChatRef.current = null;
          alert(res?.message || "Chatni ochib bo‘lmadi.");
        } else {
          const next = { ...chatData, roomId: res.room };
          activeChatRef.current = next;
          setActiveChat(next);
          setChatSummaries((prev) => ({
            ...prev,
            [res.room]: { ...(prev[res.room] || {}), unreadCount: 0 },
          }));
        }
      }
    );
  };

  const handleMessageChange = (e) => {
    const val = e.target.value;
    setMessage(val);
    if (activeChat?.id && !editingMsgId) {
      const chatKey = `${activeChat.isGroup ? "g" : "u"}:${activeChat.id}`;
      draftsRef.current[chatKey] = val;
    }
    if (activeChat) {
      const roomName = activeChat.roomId;
      if (val.trim().length > 0) {
        if (roomName) socket.emit("typing", { room: roomName });
        if (clientTypingTimeoutRef.current)
          clearTimeout(clientTypingTimeoutRef.current);
        clientTypingTimeoutRef.current = setTimeout(() => {
          if (roomName) socket.emit("stop_typing", { room: roomName });
        }, 2000);
      } else {
        if (roomName) socket.emit("stop_typing", { room: roomName });
      }
    }
  };

  // Rule 2: Give every new message a unique clientMessageId per chat & preserve typed text on delay/switch/failure
  const sendMessage = (e) => {
    e.preventDefault();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (clientTypingTimeoutRef.current)
      clearTimeout(clientTypingTimeoutRef.current);
    if (!message.trim() || !activeChat) return;

    const targetChat = { ...activeChat };
    const roomName = targetChat.roomId;
    const chatKey = `${targetChat.isGroup ? "g" : "u"}:${targetChat.id}`;
    const textToSend = message;

    if (roomName) socket.emit("stop_typing", { room: roomName });

    if (editingMsgId) {
      socket.emit(
        "edit_message",
        { msgId: editingMsgId, newText: textToSend, room: roomName },
        (res) => {
          if (!res?.success) {
            alert(res?.message || "Xabarni tahrirlab bo‘lmadi.");
            return;
          }
          if (activeChatRef.current?.id === targetChat.id) {
            setEditingMsgId(null);
            setMessage("");
          }
        }
      );
      return;
    }

    if (!pendingIdsRef.current[chatKey]) {
      pendingIdsRef.current[chatKey] =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const clientMessageId = pendingIdsRef.current[chatKey];

    const messageData = {
      target: targetChat.id || targetChat.name,
      groupId: targetChat.isGroup ? targetChat.id : undefined,
      text: textToSend,
      clientMessageId,
      file: null,
      fileName: null,
      fileType: null,
      isGroup: targetChat.isGroup,
      replyTo: replyingToMsg
        ? { sender: replyingToMsg.sender, text: replyingToMsg.text || "Fayl" }
        : null,
    };

    socket.emit("send_message", messageData, (res) => {
      if (!res?.success) {
        alert(res?.message || "Xabar yuborilmadi. Matn saqlab qolindi.");
        return;
      }
      delete pendingIdsRef.current[chatKey];
      delete draftsRef.current[chatKey];
      if (activeChatRef.current?.id === targetChat.id) {
        setMessage((prev) => (prev === textToSend ? "" : prev));
        setReplyingToMsg(null);
        setShowEmojiPicker(false);
      }
    });
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, msg });
  };

  const handleDeleteMessage = (msgId) => {
    if (activeChat) {
      socket.emit(
        "delete_message",
        { msgId, room: activeChat.roomId },
        (res) => {
          if (res && !res.success) alert(res.message);
        }
      );
    }
    setContextMenu(null);
  };

  const handleStartEdit = (msg) => {
    setEditingMsgId(msg.id);
    setMessage(msg.text);
    setContextMenu(null);
  };

  const handleStartReply = (msg) => {
    setReplyingToMsg(msg);
    setContextMenu(null);
  };

  const handleToggleReaction = (msgId, emoji) => {
    if (activeChat) {
      socket.emit(
        "toggle_reaction",
        { msgId, emoji, room: activeChat.roomId },
        (res) => {
          if (res && !res.success) alert(res.message);
        }
      );
    }
    setReactionPickerMsgId(null);
  };

  const handleClearChat = () => {
    if (!activeChat) return;
    if (window.confirm("Haqiqatan ham chat tarixini tozalamoqchimisiz?")) {
      socket.emit("clear_chat", { room: activeChat.roomId }, (res) => {
        if (res && !res.success) alert(res.message);
      });
    }
  };

  const handleDeleteChat = () => {
    if (!activeChat) return;
    if (
      window.confirm(
        "Haqiqatan ham ushbu chatni ro‘yxatingizdan olib tashlamoqchimisiz?"
      )
    ) {
      setHiddenChats((prev) => [...prev, activeChat.name]);
      closeActiveChat();
    }
  };

  const handleLeaveOrDeleteGroup = () => {
    if (!activeChat || !activeChat.isGroup) return;
    const isConfirm = window.confirm(
      "Guruhdan chiqmoqchimisiz yoki o'chirmoqchimisiz?"
    );
    if (isConfirm) {
      socket.emit(
        "delete_or_leave_group",
        { groupId: activeChat.id },
        (res) => {
          if (res?.success) {
            setHiddenChats((prev) => [...prev, activeChat.name]);
            closeActiveChat();
          } else {
            alert(res?.message || "Guruhdan chiqishda xatolik.");
          }
        }
      );
    }
  };

  const handleCreateGroup = (e) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      socket.emit(
        "create_group",
        { groupName: newGroupName.trim(), members: selectedGroupMembers },
        (res) => {
          if (res?.success) {
            setIsCreateGroupOpen(false);
            setNewGroupName("");
            setSelectedGroupMembers([]);
            handleSelectChat(res.group, true);
          } else {
            alert(res?.message || "Guruh yaratishda xatolik.");
          }
        }
      );
    }
  };

  const addEmoji = (emo) => setMessage((prev) => prev + emo);

  const openPrivateFile = async (fileUrl, fileName) => {
    try {
      const response = await fetch(`${SERVER_URL}${fileUrl}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("chat_token") || ""}`,
        },
      });
      if (!response.ok)
        throw new Error("Faylni olish huquqi yo‘q yoki fayl topilmadi.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName || "download";
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      alert(error.message || "Faylni yuklab bo‘lmadi.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("chat_token") || "";
    const pending = (messages || []).filter(
      (msg) =>
        typeof msg.file === "string" &&
        msg.file.startsWith("/api/files/") &&
        !privateFileUrls[msg.id]
    );
    Promise.all(
      pending.map(async (msg) => {
        try {
          const response = await fetch(`${SERVER_URL}${msg.file}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) return null;
          return [msg.id, URL.createObjectURL(await response.blob())];
        } catch (error) {
          return null;
        }
      })
    ).then((entries) => {
      if (cancelled) {
        entries.filter(Boolean).forEach(([, url]) => URL.revokeObjectURL(url));
        return;
      }
      const available = Object.fromEntries(entries.filter(Boolean));
      if (Object.keys(available).length)
        setPrivateFileUrls((current) => ({ ...current, ...available }));
    });
    return () => {
      cancelled = true;
    };
  }, [messages, privateFileUrls]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(t.fileTooLarge);
      e.target.value = "";
      return;
    }
    try {
      const response = await fetch(`${SERVER_URL}/api/files`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("chat_token") || ""}`,
          "Content-Type": "application/octet-stream",
          "X-File-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-Chat-Target": activeChat.id || activeChat.name,
          "X-Chat-Group": String(!!activeChat.isGroup),
        },
        body: file,
      });
      const uploaded = await response.json();
      if (!response.ok || !uploaded.success)
        throw new Error(uploaded.message || "Fayl yuklanmadi.");
      const messageData = {
        target: activeChat.id || activeChat.name,
        groupId: activeChat.isGroup ? activeChat.id : undefined,
        text: "",
        file: uploaded.file,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        clientMessageId:
          globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        isGroup: activeChat.isGroup,
        replyTo: replyingToMsg
          ? { sender: replyingToMsg.sender, text: replyingToMsg.text || "Fayl" }
          : null,
      };
      socket.emit("send_message", messageData, (res) => {
        if (!res?.success) {
          alert(res?.message || "Fayl xabarga biriktirilmadi.");
          return;
        }
        setReplyingToMsg(null);
        e.target.value = "";
      });
    } catch (error) {
      alert(error.message || "Fayl yuborilmadi.");
    }
  };

  // Rule 12: Upload avatar as a standalone file via HTTP, never Base64 over socket/localStorage
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert(t.fileTooLarge);
      e.target.value = "";
      return;
    }
    try {
      const response = await fetch(`${SERVER_URL}/api/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("chat_token") || ""}`,
          "Content-Type": "application/octet-stream",
          "X-File-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Avatarni yuklab bo‘lmadi.");
      }
      setAvatar(data.avatar);
      e.target.value = "";
    } catch (error) {
      alert(error.message || "Avatar yuklashda xatolik.");
    }
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    socket.emit(
      "update_profile",
      { newUsername, bio },
      (res) => {
        if (res?.success) {
          localStorage.setItem("chat_username", res.newUsername);
          setUsername(res.newUsername);
          localStorage.setItem("chat_bio", bio);
          setIsSettingsOpen(false);
        } else {
          alert(res?.message || "Profilni saqlashda xatolik.");
        }
      }
    );
  };

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const filteredUsers = allUsers
    .filter((u) => String(u.id || u.userId) !== String(userId))
    .filter((u) => {
      const matchesSearch = u.username
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const isHidden = hiddenChats.includes(u.username);
      if (searchQuery.trim() !== "") return matchesSearch;
      return matchesSearch && !isHidden;
    });

  const filteredGroups = allGroups.filter((g) => {
    const isMember =
      (g.memberIds || []).map(String).includes(String(userId)) ||
      String(g.adminId || "") === String(userId);
    if (!isMember) return false;
    const matchesSearch = g.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const isHidden = hiddenChats.includes(g.name);
    if (searchQuery.trim() !== "") return matchesSearch;
    return matchesSearch && !isHidden;
  });

  if (!isLoggedIn) {
    return (
      <AuthScreen
        theme={theme}
        handleAuth={handleAuth}
        isRegistering={isRegistering}
        setIsRegistering={setIsRegistering}
        authError={authError}
        setAuthError={setAuthError}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
      />
    );
  }

  const currentPartner =
    activeChat && !activeChat.isGroup
      ? allUsers.find(
          (u) =>
            String(u.id || u.userId) === String(activeChat.id) ||
            u.username === activeChat.name
        )
      : null;

  return (
    <div
      className={`telegram-app ${theme} ${wallpaper} ${
        activeChat ? "chat-active" : ""
      }`}
    >
      <Sidebar
        username={username}
        userId={userId}
        avatar={avatar}
        t={t}
        theme={theme}
        toggleTheme={toggleTheme}
        setIsCreateGroupOpen={setIsCreateGroupOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filteredGroups={filteredGroups}
        filteredUsers={filteredUsers}
        activeChat={activeChat}
        handleSelectChat={handleSelectChat}
        typingUsers={typingUsers}
        chatSummaries={chatSummaries}
      />

      <ChatArea
        activeChat={activeChat}
        closeActiveChat={closeActiveChat}
        currentPartner={currentPartner}
        typingStatus={typingStatus}
        t={t}
        handleClearChat={handleClearChat}
        handleLeaveOrDeleteGroup={handleLeaveOrDeleteGroup}
        handleDeleteChat={handleDeleteChat}
        messagesContainerRef={messagesContainerRef}
        handleMessagesScroll={handleMessagesScroll}
        messages={messages}
        userId={userId}
        username={username}
        handleContextMenu={handleContextMenu}
        privateFileUrls={privateFileUrls}
        setActiveMedia={setActiveMedia}
        openPrivateFile={openPrivateFile}
        handleToggleReaction={handleToggleReaction}
        reactionPickerMsgId={reactionPickerMsgId}
        setReactionPickerMsgId={setReactionPickerMsgId}
        messagesEndRef={messagesEndRef}
        contextMenu={contextMenu}
        handleStartReply={handleStartReply}
        handleStartEdit={handleStartEdit}
        handleDeleteMessage={handleDeleteMessage}
        replyingToMsg={replyingToMsg}
        setReplyingToMsg={setReplyingToMsg}
        editingMsgId={editingMsgId}
        setEditingMsgId={setEditingMsgId}
        setMessage={setMessage}
        sendMessage={sendMessage}
        showEmojiPicker={showEmojiPicker}
        setShowEmojiPicker={setShowEmojiPicker}
        addEmoji={addEmoji}
        handleFileUpload={handleFileUpload}
        message={message}
        handleMessageChange={handleMessageChange}
      />

      <Modals
        isCreateGroupOpen={isCreateGroupOpen}
        setIsCreateGroupOpen={setIsCreateGroupOpen}
        handleCreateGroup={handleCreateGroup}
        t={t}
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        allUsers={allUsers}
        userId={userId}
        selectedGroupMembers={selectedGroupMembers}
        setSelectedGroupMembers={setSelectedGroupMembers}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        avatar={avatar}
        username={username}
        handleSaveProfile={handleSaveProfile}
        handleAvatarUpload={handleAvatarUpload}
        newUsername={newUsername}
        setNewUsername={setNewUsername}
        bio={bio}
        setBio={setBio}
        theme={theme}
        setTheme={setTheme}
        wallpaper={wallpaper}
        setWallpaper={setWallpaper}
        notifications={notifications}
        setNotifications={setNotifications}
        language={language}
        setLanguage={setLanguage}
        handleLogout={handleLogout}
        handleDeleteAccount={handleDeleteAccount}
        activeMedia={activeMedia}
        setActiveMedia={setActiveMedia}
      />
    </div>
  );
}

export default App;
