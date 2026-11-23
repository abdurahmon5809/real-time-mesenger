import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { socket } from "./utils/socket";
import { DEFAULT_BIO } from "./utils/constants";
import { createTranslator } from "./utils/i18n";
import { useChatSocket } from "./hooks/useChatSocket";
import AuthScreen from "./components/AuthScreen";
import Sidebar from "./components/Sidebar";
import ChatArea from "./components/ChatArea";
import {
  CreateGroupModal,
  ProfileModal,
  GroupInfoModal,
  SettingsModal,
  MediaViewerModal,
} from "./components/Modals";
import "./App.css";

const createClientMsgId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [myAvatar, setMyAvatar] = useState("");
  const [myBio, setMyBio] = useState(DEFAULT_BIO);
  const [authError, setAuthError] = useState("");

  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [activeChat, setActiveChat] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState("");
  const [messages, setMessages] = useState([]);
  const [typingByRoom, setTypingByRoom] = useState({});
  const [isConnected, setIsConnected] = useState(socket.connected);

  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [chatError, setChatError] = useState("");

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [groupInfoTarget, setGroupInfoTarget] = useState(null);
  const [mediaViewer, setMediaViewer] = useState(null);

  const [theme, setTheme] = useState(
    () => localStorage.getItem("chat_theme") || "light",
  );
  const [wallpaper, setWallpaper] = useState(
    () => localStorage.getItem("chat_wallpaper") || "doodle",
  );
  const [language, setLanguage] = useState(
    () => localStorage.getItem("chat_lang") || "uz",
  );
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem("chat_sound") !== "false",
  );

  const t = useMemo(() => createTranslator(language), [language]);

  const activeChatRef = useRef(activeChat);
  const currentRoomIdRef = useRef(currentRoomId);
  const currentUserRef = useRef(currentUser);
  const currentUserIdRef = useRef(currentUserId);
  const tRef = useRef(t);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    document.body.classList.toggle("dark", theme === "dark");
    localStorage.setItem("chat_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("chat_wallpaper", wallpaper);
  }, [wallpaper]);

  useEffect(() => {
    localStorage.setItem("chat_lang", language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem("chat_sound", String(soundEnabled));
  }, [soundEnabled]);

  const computeRoomIdForChat = useCallback((chat, myId) => {
    if (!chat) return "";
    if (chat.isGroup && chat.id) return `group:${chat.id}`;
    if (!chat.isGroup && myId && chat.id) {
      return `dm:${[String(myId), String(chat.id)].sort().join(":")}`;
    }
    return "";
  }, []);

  const clearSessionState = useCallback((notice = "") => {
    setCurrentUser("");
    setCurrentUserId("");
    setAuthToken("");
    setMyAvatar("");
    setMyBio(DEFAULT_BIO);
    setUsers([]);
    setGroups([]);
    setSummaries({});
    setActiveChat(null);
    setCurrentRoomId("");
    setMessages([]);
    setTypingByRoom({});
    setHasMoreMessages(false);
    setIsLoadingOlder(false);
    setChatError("");
    setShowCreateGroup(false);
    setShowProfileModal(false);
    setShowSettingsModal(false);
    setGroupInfoTarget(null);
    if (notice) setAuthError(notice);
  }, []);

  useEffect(() => {
    const savedToken =
      sessionStorage.getItem("chat_token") ||
      localStorage.getItem("chat_token") ||
      "";
    const savedUsername =
      sessionStorage.getItem("chat_user") ||
      localStorage.getItem("chat_user") ||
      "";
    const savedUserId =
      sessionStorage.getItem("chat_user_id") ||
      localStorage.getItem("chat_user_id") ||
      "";

    if (savedToken) {
      setAuthToken(savedToken);
      if (savedUsername) setCurrentUser(savedUsername);
      if (savedUserId) setCurrentUserId(savedUserId);
      socket.auth = { token: savedToken };
      if (!socket.connected) socket.connect();
    }
  }, []);

  const { bumpRoomGeneration, requestOlderMessages } = useChatSocket({
    authToken,
    activeChat,
    currentUserId,
    soundEnabled,
    onConnectedChange: setIsConnected,
    onSessionRestored: (userObj) => {
      if (!userObj) return;
      setCurrentUser(userObj.username || "");
      setCurrentUserId(userObj.id || userObj.userId || "");
      setMyAvatar(userObj.avatar || "");
      setMyBio(userObj.bio || DEFAULT_BIO);
      setAuthError("");
      if (userObj.username)
        sessionStorage.setItem("chat_user", userObj.username);
      if (userObj.id || userObj.userId)
        sessionStorage.setItem("chat_user_id", userObj.id || userObj.userId);
    },
    onSessionExpired: (msg) => {
      sessionStorage.removeItem("chat_token");
      sessionStorage.removeItem("chat_user");
      sessionStorage.removeItem("chat_user_id");
      localStorage.removeItem("chat_token");
      localStorage.removeItem("chat_user");
      localStorage.removeItem("chat_user_id");
      clearSessionState(msg);
    },
    onDirectoryUpdate: (payload) => {
      if (!payload) return;
      if (Array.isArray(payload.users)) {
        setUsers(payload.users);
        const me = payload.users.find(
          (u) =>
            (currentUserIdRef.current &&
              (u.id === currentUserIdRef.current ||
                u.userId === currentUserIdRef.current)) ||
            u.username === currentUserRef.current,
        );
        if (me) {
          if (me.username) setCurrentUser(me.username);
          if (me.avatar !== undefined) setMyAvatar(me.avatar || "");
          if (me.bio !== undefined) setMyBio(me.bio || DEFAULT_BIO);
        }
      }
      if (Array.isArray(payload.groups)) {
        setGroups(payload.groups);
      }
      if (payload.summaries && typeof payload.summaries === "object") {
        setSummaries(payload.summaries);
      }
    },
    onRoomJoined: (payload) => {
      if (!payload?.room) return;
      setCurrentRoomId(payload.room);
      setActiveChat((prev) => {
        if (!prev) return prev;
        if (
          payload.isGroup &&
          prev.isGroup &&
          (prev.name === payload.target || prev.id === payload.targetId)
        ) {
          return {
            ...prev,
            id: payload.targetId || prev.id,
            name: payload.target || prev.name,
          };
        }
        if (
          !payload.isGroup &&
          !prev.isGroup &&
          (prev.name === payload.target || prev.id === payload.targetId)
        ) {
          return {
            ...prev,
            id: payload.targetId || prev.id,
            name: payload.target || prev.name,
          };
        }
        return prev;
      });
    },
    onLoadHistory: (payload) => {
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (
        !payload ||
        (activeRoom && payload.room && payload.room !== activeRoom)
      )
        return;
      const hist = Array.isArray(payload.history) ? payload.history : [];
      setMessages(hist);
      setHasMoreMessages(hist.length >= 50);
      setIsLoadingOlder(false);

      const lastIncoming = [...hist]
        .reverse()
        .find(
          (m) =>
            m.sender !== currentUserRef.current &&
            (!currentUserIdRef.current ||
              String(m.senderId) !== String(currentUserIdRef.current)),
        );
      if (lastIncoming?.id && payload.room) {
        socket.emit("mark_read", {
          room: payload.room,
          upToMessageId: lastIncoming.id,
        });
      }
    },
    onReceiveMessage: (msg) => {
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (!activeRoom || msg.room !== activeRoom) return;

      setMessages((prev) => {
        const filtered = prev.filter((item) => {
          if (!item.pending) return true;
          if (
            msg.clientMessageId &&
            item.clientMessageId === msg.clientMessageId
          )
            return false;
          if (
            item.text &&
            msg.text &&
            item.text === msg.text &&
            item.sender === msg.sender
          )
            return false;
          return true;
        });
        const exists = filtered.some(
          (item) =>
            (msg.id && item.id === msg.id) || (msg._id && item._id === msg._id),
        );
        if (exists) return filtered;
        return [...filtered, msg];
      });

      const isFromMe =
        (currentUserIdRef.current &&
          msg.senderId &&
          String(msg.senderId) === String(currentUserIdRef.current)) ||
        msg.sender === currentUserRef.current;
      if (!isFromMe && msg.id) {
        socket.emit("mark_read", { room: msg.room, upToMessageId: msg.id });
      }
    },
    onMessageUpdated: (payload) => {
      const updated = payload?.message || payload;
      if (!updated) return;
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (payload?.room && activeRoom && payload.room !== activeRoom) return;

      setMessages((prev) =>
        prev.map((m) =>
          (updated.id && m.id === updated.id) ||
          (updated._id && m._id === updated._id)
            ? { ...m, ...updated }
            : m,
        ),
      );
    },
    onMessageDeleted: (payload) => {
      const targetId = payload?.msgId || payload?.id;
      if (!targetId) return;
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (payload?.room && activeRoom && payload.room !== activeRoom) return;

      setMessages((prev) =>
        prev.filter((m) => m.id !== targetId && m._id !== targetId),
      );
    },
    onMessagesRead: (payload) => {
      if (!payload) return;
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (payload.room && activeRoom && payload.room !== activeRoom) return;

      setMessages((prev) => {
        let reachedTarget = !payload.upToMessageId;
        return prev.map((m) => {
          const isMine =
            (currentUserIdRef.current &&
              m.senderId &&
              String(m.senderId) === String(currentUserIdRef.current)) ||
            m.sender === currentUserRef.current;
          if (isMine && !reachedTarget) {
            if (m.id === payload.upToMessageId) reachedTarget = true;
            return { ...m, isRead: true };
          }
          if (isMine && reachedTarget) {
            return { ...m, isRead: true };
          }
          return m;
        });
      });
    },
    onChatDeleted: (payload) => {
      const deletedRoom = payload?.room;
      const activeRoom =
        currentRoomIdRef.current ||
        computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
      if (deletedRoom && activeRoom === deletedRoom) {
        setActiveChat(null);
        setCurrentRoomId("");
        setMessages([]);
        setChatError(tRef.current("chatDeletedNotice"));
      }
      setGroupInfoTarget(null);
    },
    onDisplayTyping: ({ username, room }) => {
      if (!room || !username) return;
      setTypingByRoom((prev) => {
        const list = prev[room] || [];
        if (list.includes(username)) return prev;
        return { ...prev, [room]: [...list, username] };
      });
    },
    onHideTyping: ({ username, room }) => {
      if (!room || !username) return;
      setTypingByRoom((prev) => {
        const list = prev[room] || [];
        return { ...prev, [room]: list.filter((u) => u !== username) };
      });
    },
  });

  const handleAuthSuccess = ({ username, userId, token, avatar, bio }) => {
    setCurrentUser(username);
    setCurrentUserId(userId);
    setAuthToken(token);
    setMyAvatar(avatar || "");
    setMyBio(bio || DEFAULT_BIO);
    setAuthError("");
    setChatError("");

    sessionStorage.setItem("chat_token", token);
    sessionStorage.setItem("chat_user", username);
    if (userId) sessionStorage.setItem("chat_user_id", userId);

    bumpRoomGeneration();
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
  };

  const handleLogout = () => {
    const finishLogout = () => {
      sessionStorage.removeItem("chat_token");
      sessionStorage.removeItem("chat_user");
      sessionStorage.removeItem("chat_user_id");
      localStorage.removeItem("chat_token");
      localStorage.removeItem("chat_user");
      localStorage.removeItem("chat_user_id");
      bumpRoomGeneration();
      clearSessionState();
      if (socket.connected) {
        socket.disconnect();
      }
    };

    if (socket.connected) {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          finishLogout();
        }
      }, 1500);

      socket.emit("logout", {}, () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          finishLogout();
        }
      });
    } else {
      finishLogout();
    }
  };

  const handleSelectChat = (chat) => {
    setChatError("");
    const prevRoom = currentRoomIdRef.current;
    if (prevRoom && socket.connected) {
      socket.emit("leave_room", { room: prevRoom });
    }

    bumpRoomGeneration();
    setActiveChat(chat);
    setMessages([]);
    setHasMoreMessages(false);
    setIsLoadingOlder(false);

    const predictedRoom = computeRoomIdForChat(chat, currentUserId);
    setCurrentRoomId(predictedRoom);

    if (socket.connected) {
      socket.emit(
        "join_room",
        { target: chat.id || chat.name, isGroup: !!chat.isGroup },
        (res) => {
          if (res && !res.success) {
            setChatError(res.message || t("joinFailedError"));
          }
        },
      );
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

  const handleSendMessage = ({ text, file, fileName, fileType, replyTo }) => {
    const chat = activeChatRef.current;
    if (!chat) return;
    setChatError("");

    const clientMessageId = createClientMsgId();
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(chat, currentUserIdRef.current);
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const optimisticMsg = {
      id: clientMessageId,
      clientMessageId,
      room,
      senderId: currentUserIdRef.current,
      sender: currentUserRef.current,
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

    setMessages((prev) => [...prev, optimisticMsg]);

    if (!socket.connected) {
      setChatError(t("disconnectedError"));
      setMessages((prev) =>
        prev.filter((m) => m.clientMessageId !== clientMessageId),
      );
      return;
    }

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
        if (!res?.success) {
          setMessages((prev) =>
            prev.filter((m) => m.clientMessageId !== clientMessageId),
          );
          setChatError(res?.message || t("sendFailedError"));
          return;
        }
        if (res.message) {
          setMessages((prev) =>
            prev.map((m) =>
              m.clientMessageId === clientMessageId
                ? { ...res.message, pending: false }
                : m,
            ),
          );
        }
      },
    );
  };

  const handleEditMessage = (msgId, newText) => {
    const room =
      currentRoomIdRef.current ||
      computeRoomIdForChat(activeChatRef.current, currentUserIdRef.current);
    socket.emit("edit_message", { msgId, newText, room }, (res) => {
      if (!res?.success) {
        setChatError(res?.message || t("sendFailedError"));
      }
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

  const handleCreateGroup = (groupName, members, cb) => {
    socket.emit("create_group", { groupName, members }, (res) => {
      cb?.(res);
    });
  };

  const handleSaveProfile = ({ newUsername, bio, avatar }, cb) => {
    socket.emit("update_profile", { newUsername, bio }, (res) => {
      if (res?.success) {
        const updatedName =
          res.newUsername || res.user?.username || newUsername;
        setCurrentUser(updatedName);
        setMyBio(res.user?.bio ?? bio);
        if (avatar) setMyAvatar(avatar);
        sessionStorage.setItem("chat_user", updatedName);
      }
      cb?.(res);
    });
  };

  const handleDeleteAccount = (cb) => {
    socket.emit("delete_account", {}, (res) => {
      cb?.(res);
      if (res?.success) {
        sessionStorage.removeItem("chat_token");
        sessionStorage.removeItem("chat_user");
        sessionStorage.removeItem("chat_user_id");
        localStorage.removeItem("chat_token");
        localStorage.removeItem("chat_user");
        localStorage.removeItem("chat_user_id");
        bumpRoomGeneration();
        clearSessionState(t("accountDeletedNotice"));
        if (socket.connected) socket.disconnect();
      }
    });
  };

  const handleRemoveGroupMember = (
    { groupId, groupName, memberId, memberUsername },
    cb,
  ) => {
    socket.emit(
      "remove_group_member",
      { groupId, groupName, memberId, memberUsername },
      (res) => {
        cb?.(res);
      },
    );
  };

  const handleDeleteOrLeaveGroup = (groupIdOrName, isAdmin) => {
    const payload = { groupId: groupIdOrName, groupName: groupIdOrName };
    socket.emit("delete_or_leave_group", payload, (res) => {
      if (!res?.success) {
        setChatError(res?.message || t("sendFailedError"));
      }
    });
  };

  const handleTyping = () => {
    const room = currentRoomIdRef.current;
    if (room && socket.connected) socket.emit("typing", { room });
  };

  const handleStopTyping = () => {
    const room = currentRoomIdRef.current;
    if (room && socket.connected) socket.emit("stop_typing", { room });
  };

  if (!authToken || !currentUser) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        initialError={authError}
        t={t}
      />
    );
  }

  const activeRoom =
    currentRoomId || computeRoomIdForChat(activeChat, currentUserId);
  const currentTypingUsers = activeRoom ? typingByRoom[activeRoom] || [] : [];

  return (
    <div className={`app-shell ${activeChat ? "has-active-chat" : ""}`}>
      <Sidebar
        currentUser={currentUser}
        currentUserId={currentUserId}
        myAvatar={myAvatar}
        users={users}
        groups={groups}
        activeChat={activeChat}
        onSelectChat={handleSelectChat}
        onOpenCreateGroup={() => setShowCreateGroup(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLogout={handleLogout}
        summaries={summaries}
        isConnected={isConnected}
        t={t}
      />

      <ChatArea
        activeChat={activeChat}
        currentUser={currentUser}
        currentUserId={currentUserId}
        messages={messages}
        typingUsers={currentTypingUsers}
        users={users}
        groups={groups}
        onSendMessage={handleSendMessage}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onToggleReaction={handleToggleReaction}
        onClearChat={handleClearChat}
        onDeleteOrLeaveGroup={handleDeleteOrLeaveGroup}
        onOpenGroupInfo={(grp) => setGroupInfoTarget(grp)}
        onTyping={handleTyping}
        onStopTyping={handleStopTyping}
        onLoadOlder={handleLoadOlder}
        hasMoreMessages={hasMoreMessages}
        isLoadingOlder={isLoadingOlder}
        onPreviewMedia={(url, name) => setMediaViewer({ url, fileName: name })}
        onBackToList={() => {
          const prevRoom = currentRoomIdRef.current;
          if (prevRoom && socket.connected)
            socket.emit("leave_room", { room: prevRoom });
          bumpRoomGeneration();
          setActiveChat(null);
          setCurrentRoomId("");
          setMessages([]);
        }}
        wallpaper={wallpaper}
        soundEnabled={soundEnabled}
        chatError={chatError}
        onClearChatError={() => setChatError("")}
        token={authToken}
        t={t}
      />

      {showCreateGroup && (
        <CreateGroupModal
          users={users}
          currentUser={currentUser}
          currentUserId={currentUserId}
          onClose={() => setShowCreateGroup(false)}
          onCreate={handleCreateGroup}
          t={t}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          currentUser={currentUser}
          currentUserId={currentUserId}
          avatar={myAvatar}
          bio={myBio}
          token={authToken}
          onClose={() => setShowProfileModal(false)}
          onSaveProfile={handleSaveProfile}
          onDeleteAccount={handleDeleteAccount}
          t={t}
        />
      )}

      {groupInfoTarget && (
        <GroupInfoModal
          group={
            groups.find(
              (g) =>
                (typeof g === "object" &&
                  (g.id === groupInfoTarget.id ||
                    g.name === groupInfoTarget.name)) ||
                g === groupInfoTarget,
            ) || groupInfoTarget
          }
          currentUser={currentUser}
          currentUserId={currentUserId}
          users={users}
          onClose={() => setGroupInfoTarget(null)}
          onRemoveMember={handleRemoveGroupMember}
          onDeleteOrLeave={handleDeleteOrLeaveGroup}
          t={t}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          theme={theme}
          onToggleTheme={() =>
            setTheme((prev) => (prev === "dark" ? "light" : "dark"))
          }
          wallpaper={wallpaper}
          onChangeWallpaper={setWallpaper}
          language={language}
          onChangeLanguage={setLanguage}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((prev) => !prev)}
          onClose={() => setShowSettingsModal(false)}
          t={t}
        />
      )}

      {mediaViewer && (
        <MediaViewerModal
          mediaUrl={mediaViewer.url}
          fileName={mediaViewer.fileName}
          onClose={() => setMediaViewer(null)}
          t={t}
        />
      )}
    </div>
  );
}
