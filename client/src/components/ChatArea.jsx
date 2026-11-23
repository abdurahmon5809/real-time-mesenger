import React, { useState, useRef, useEffect } from "react";
import { API_URL, EMOJIS } from "../utils/constants";
import { getAvatarColor, getInitials, resolveAvatar } from "../utils/media";

function ChatAvatar({ name, avatar, size = 40, isOnline = false }) {
  const src = resolveAvatar(avatar);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  return (
    <div
      className="avatar-wrapper"
      style={{ width: size, height: size, minWidth: size }}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={name || "Avatar"}
          className="avatar-img"
          style={{ width: size, height: size }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="avatar-placeholder"
          style={{
            width: size,
            height: size,
            backgroundColor: getAvatarColor(name),
            fontSize: Math.max(11, Math.floor(size * 0.38)),
          }}
        >
          {getInitials(name)}
        </div>
      )}
      {isOnline && <span className="online-badge" />}
    </div>
  );
}

export default function ChatArea({
  activeChat,
  currentUser,
  currentUserId,
  messages,
  typingUsers,
  users,
  groups,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onClearChat,
  onDeleteOrLeaveGroup,
  onOpenGroupInfo,
  onTyping,
  onStopTyping,
  onLoadOlder,
  hasMoreMessages,
  isLoadingOlder,
  onPreviewMedia,
  onBackToList,
  wallpaper,
  chatError,
  onClearChatError,
  token,
  t = (k) => k,
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);

  useEffect(() => {
    if (isPrependingRef.current && messagesListRef.current) {
      const newScrollHeight = messagesListRef.current.scrollHeight;
      messagesListRef.current.scrollTop =
        newScrollHeight - prevScrollHeightRef.current;
      isPrependingRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChat?.name]);

  useEffect(() => {
    setReplyTo(null);
    setEditingMsg(null);
    setSelectedFile(null);
    setUploadError("");
    setShowEmojiPicker(false);
    setActiveReactionMsgId(null);
    setHeaderMenuOpen(false);
    if (onClearChatError) onClearChatError();
  }, [activeChat?.id, activeChat?.name]);

  const handleMessagesScroll = () => {
    const node = messagesListRef.current;
    if (!node || !hasMoreMessages || isLoadingOlder || !onLoadOlder) return;
    if (node.scrollTop <= 10) {
      prevScrollHeightRef.current = node.scrollHeight;
      isPrependingRef.current = true;
      onLoadOlder();
    }
  };

  if (!activeChat) {
    return (
      <div className="chat-area empty-chat-area">
        <div className="empty-chat-card">
          <div className="empty-chat-icon">💬</div>
          <h2>{t("selectChatTitle")}</h2>
          <p>{t("selectChatDesc")}</p>
        </div>
      </div>
    );
  }

  const groupObj = activeChat.isGroup
    ? groups.find((g) =>
        typeof g === "object"
          ? g.id === activeChat.id || g.name === activeChat.name
          : g === activeChat.name,
      )
    : null;
  const userObj = !activeChat.isGroup
    ? users.find((u) =>
        typeof u === "object"
          ? u.id === activeChat.id || u.username === activeChat.name
          : u === activeChat.name,
      )
    : null;

  const isOnline = typeof userObj === "object" ? !!userObj?.isOnline : false;
  const chatAvatar = activeChat.isGroup
    ? typeof groupObj === "object"
      ? groupObj?.avatar
      : ""
    : typeof userObj === "object"
      ? userObj?.avatar
      : "";

  const isGroupAdmin =
    activeChat.isGroup &&
    typeof groupObj === "object" &&
    ((currentUserId && groupObj?.adminId === currentUserId) ||
      groupObj?.admin === currentUser);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    if (uploadError) setUploadError("");
    if (onClearChatError) onClearChatError();

    if (onTyping) onTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (onStopTyping) onStopTyping();
    }, 1800);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(t("errFileTooBig"));
      e.target.value = "";
      return;
    }
    setSelectedFile(file);
    e.target.value = "";
  };

  const uploadFileToServer = async (file) => {
    const res = await fetch(`${API_URL}/api/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "x-file-name": encodeURIComponent(file.name),
        "x-file-type": file.type || "application/octet-stream",
        "x-chat-target": activeChat.id || activeChat.name,
        "x-chat-group": String(!!activeChat.isGroup),
      },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.file) {
      throw new Error(data.message || t("errFileUpload"));
    }
    return data;
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (uploadingFile) return;

    const trimmed = text.trim();
    if (!trimmed && !selectedFile) {
      setUploadError(t("errEmptyMessage"));
      return;
    }

    if (onStopTyping) onStopTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (editingMsg) {
      if (!trimmed) {
        setUploadError(t("errEmptyEdit"));
        return;
      }
      onEditMessage(editingMsg.id, trimmed);
      setEditingMsg(null);
      setText("");
      return;
    }

    let uploadedPayload = null;
    if (selectedFile) {
      setUploadingFile(true);
      setUploadError("");
      try {
        uploadedPayload = await uploadFileToServer(selectedFile);
      } catch (err) {
        setUploadingFile(false);
        setUploadError(err.message || t("errFileUpload"));
        return;
      }
      setUploadingFile(false);
    }

    onSendMessage({
      text: trimmed,
      file: uploadedPayload ? uploadedPayload.file : null,
      fileName: uploadedPayload ? uploadedPayload.fileName : null,
      fileType: uploadedPayload ? uploadedPayload.fileType : null,
      replyTo: replyTo
        ? {
            sender: replyTo.sender,
            text: replyTo.text || replyTo.fileName || "Media",
          }
        : null,
    });

    setText("");
    setReplyTo(null);
    setSelectedFile(null);
    setShowEmojiPicker(false);
  };

  const startEdit = (msg) => {
    setEditingMsg(msg);
    setReplyTo(null);
    setText(msg.text || "");
    setUploadError("");
  };

  const cancelEditOrReply = () => {
    setEditingMsg(null);
    setReplyTo(null);
    setText("");
    setUploadError("");
  };

  const renderFileAttachment = (msg) => {
    if (!msg.file) return null;
    const isImage =
      (msg.fileType && msg.fileType.startsWith("image/")) ||
      /\.(png|jpe?g|gif|webp)(\?|$)/i.test(msg.fileName || msg.file);

    const downloadHref = msg.file.startsWith("http")
      ? msg.file
      : `${API_URL}${msg.file}`;

    if (isImage) {
      return (
        <div className="msg-image-wrap">
          <img
            src={downloadHref}
            alt={msg.fileName || "image"}
            className="msg-image"
            onClick={() =>
              onPreviewMedia &&
              onPreviewMedia(downloadHref, msg.fileName || "image.jpg")
            }
          />
        </div>
      );
    }

    return (
      <a
        href={downloadHref}
        target="_blank"
        rel="noopener noreferrer"
        download={msg.fileName || "file"}
        className="msg-file-card"
      >
        <div className="msg-file-icon">📄</div>
        <div className="msg-file-meta">
          <span className="msg-file-name">
            {msg.fileName || t("attachedFile")}
          </span>
          <span className="msg-file-sub">{t("downloadSub")}</span>
        </div>
      </a>
    );
  };

  const typingList = (typingUsers || []).filter(
    (u) => u !== currentUser && (!currentUserId || u !== currentUserId),
  );
  const memberCount =
    typeof groupObj === "object" && groupObj?.members
      ? groupObj.members.length
      : 0;

  return (
    <div className={`chat-area wallpaper-${wallpaper || "doodle"}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          {onBackToList && (
            <button
              type="button"
              className="icon-btn back-mobile-btn"
              onClick={onBackToList}
              title={t("backTitle")}
            >
              ←
            </button>
          )}
          <div
            className="chat-header-info clickable"
            onClick={() =>
              activeChat.isGroup &&
              onOpenGroupInfo &&
              onOpenGroupInfo(groupObj || activeChat)
            }
          >
            <ChatAvatar
              name={activeChat.name}
              avatar={chatAvatar}
              size={40}
              isOnline={!activeChat.isGroup && isOnline}
            />
            <div className="chat-header-text">
              <div className="chat-header-title">
                {activeChat.isGroup && <span className="group-tag">#</span>}
                <span>{activeChat.name}</span>
              </div>
              <div className="chat-header-status">
                {typingList.length > 0 ? (
                  <span className="typing-status-text">
                    {t("typingSingle", { users: typingList.join(", ") })}
                  </span>
                ) : activeChat.isGroup ? (
                  <span>
                    {memberCount > 0
                      ? t("membersCount", { count: memberCount })
                      : t("groupLabel")}
                  </span>
                ) : (
                  <span className={isOnline ? "online-text" : ""}>
                    {isOnline ? t("online") : t("offline")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          {activeChat.isGroup && (
            <button
              type="button"
              className="icon-btn"
              onClick={() =>
                onOpenGroupInfo && onOpenGroupInfo(groupObj || activeChat)
              }
              title={t("groupInfoTitle")}
            >
              ℹ️
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setHeaderMenuOpen((prev) => !prev)}
            title={t("chatActionsTitle")}
          >
            ⋮
          </button>

          {headerMenuOpen && (
            <>
              <div
                className="menu-backdrop"
                onClick={() => setHeaderMenuOpen(false)}
              />
              <div className="dropdown-menu right-align">
                {activeChat.isGroup && (
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onOpenGroupInfo &&
                        onOpenGroupInfo(groupObj || activeChat);
                    }}
                  >
                    <span>👥</span> {t("groupMembers")}
                  </button>
                )}
                {(!activeChat.isGroup || isGroupAdmin) && (
                  <button
                    type="button"
                    className="dropdown-item danger"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onClearChat && onClearChat();
                    }}
                  >
                    <span>🧹</span> {t("clearHistory")}
                  </button>
                )}
                {activeChat.isGroup && (
                  <button
                    type="button"
                    className="dropdown-item danger"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      onDeleteOrLeaveGroup &&
                        onDeleteOrLeaveGroup(
                          activeChat.id || activeChat.name,
                          isGroupAdmin,
                        );
                    }}
                  >
                    <span>{isGroupAdmin ? "🗑️" : "🚪"}</span>
                    {isGroupAdmin ? t("deleteGroup") : t("leaveGroup")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {(chatError || uploadError) && (
        <div className="chat-alert-banner" role="alert">
          <span>{uploadError || chatError}</span>
          <button
            type="button"
            className="chat-alert-close"
            onClick={() => {
              setUploadError("");
              if (onClearChatError) onClearChatError();
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div
        className="messages-list"
        ref={messagesListRef}
        onScroll={handleMessagesScroll}
      >
        {isLoadingOlder && (
          <div className="loading-older-hint">{t("loadingOlder")}</div>
        )}
        {hasMoreMessages && !isLoadingOlder && messages.length > 0 && (
          <div className="load-more-hint">{t("scrollOlderHint")}</div>
        )}

        {messages.length === 0 ? (
          <div className="no-messages-placeholder">{t("noMessagesYet")}</div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn =
              (currentUserId &&
                msg.senderId &&
                String(msg.senderId) === String(currentUserId)) ||
              msg.sender === currentUser;

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showSenderName =
              activeChat.isGroup &&
              !isOwn &&
              (!prevMsg ||
                prevMsg.sender !== msg.sender ||
                prevMsg.senderId !== msg.senderId);

            const reactionsObj =
              msg.reactions instanceof Map
                ? Object.fromEntries(msg.reactions)
                : msg.reactions && typeof msg.reactions === "object"
                  ? msg.reactions
                  : {};

            return (
              <div
                key={msg.id || msg._id || `${msg.sender}-${idx}`}
                className={`message-row ${isOwn ? "own" : "other"}`}
              >
                {!isOwn && activeChat.isGroup && (
                  <div className="msg-sender-avatar">
                    <ChatAvatar name={msg.sender} avatar="" size={30} />
                  </div>
                )}

                <div
                  className={`message-bubble ${isOwn ? "own" : "other"} ${msg.pending ? "pending" : ""}`}
                >
                  {showSenderName && (
                    <div className="msg-sender-label">{msg.sender}</div>
                  )}

                  {msg.replyTo && (
                    <div className="msg-reply-quote">
                      <div className="msg-reply-sender">
                        {msg.replyTo.sender}
                      </div>
                      <div className="msg-reply-text">{msg.replyTo.text}</div>
                    </div>
                  )}

                  {renderFileAttachment(msg)}

                  {msg.text && <div className="msg-text">{msg.text}</div>}

                  <div className="msg-meta">
                    {msg.isEdited && (
                      <span className="msg-edited">{t("editedTag")}</span>
                    )}
                    <span className="msg-time">{msg.time || ""}</span>
                    {isOwn && (
                      <span
                        className={`msg-status ${msg.pending ? "pending" : msg.isRead ? "read" : "sent"}`}
                      >
                        {msg.pending ? "🕒" : msg.isRead ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>

                  {Object.keys(reactionsObj).length > 0 && (
                    <div className="msg-reactions-list">
                      {Object.entries(reactionsObj).map(
                        ([emoji, usersList]) => {
                          const list = Array.isArray(usersList)
                            ? usersList
                            : [];
                          if (!list.length) return null;
                          const reactedByMe =
                            (currentUserId &&
                              list.includes(String(currentUserId))) ||
                            list.includes(currentUser);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              className={`reaction-chip ${reactedByMe ? "active" : ""}`}
                              onClick={() =>
                                onToggleReaction &&
                                onToggleReaction(msg.id, emoji)
                              }
                            >
                              <span>{emoji}</span>
                              <span className="reaction-count">
                                {list.length}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}

                  <div className="msg-hover-actions">
                    <button
                      type="button"
                      title={t("reactionTitle")}
                      onClick={() =>
                        setActiveReactionMsgId((prev) =>
                          prev === msg.id ? null : msg.id,
                        )
                      }
                    >
                      😊
                    </button>
                    <button
                      type="button"
                      title={t("replyTitle")}
                      onClick={() => {
                        setEditingMsg(null);
                        setReplyTo(msg);
                      }}
                    >
                      ↩️
                    </button>
                    {isOwn && !msg.pending && msg.text && (
                      <button
                        type="button"
                        title={t("editTitle")}
                        onClick={() => startEdit(msg)}
                      >
                        ✏️
                      </button>
                    )}
                    {(isOwn || isGroupAdmin) && !msg.pending && (
                      <button
                        type="button"
                        title={t("deleteTitle")}
                        onClick={() =>
                          onDeleteMessage && onDeleteMessage(msg.id)
                        }
                      >
                        🗑️
                      </button>
                    )}
                  </div>

                  {activeReactionMsgId === msg.id && (
                    <div className="reaction-popover">
                      {EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            onToggleReaction && onToggleReaction(msg.id, em);
                            setActiveReactionMsgId(null);
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {(replyTo || editingMsg || selectedFile) && (
        <div className="composer-banner">
          <div className="composer-banner-content">
            {editingMsg && (
              <>
                <span className="banner-tag">{t("editingBanner")}</span>
                <span className="banner-preview">{editingMsg.text}</span>
              </>
            )}
            {replyTo && !editingMsg && (
              <>
                <span className="banner-tag">
                  {t("replyBanner", { sender: replyTo.sender })}
                </span>
                <span className="banner-preview">
                  {replyTo.text || replyTo.fileName || "Media"}
                </span>
              </>
            )}
            {selectedFile && (
              <>
                <span className="banner-tag">{t("fileBanner")}</span>
                <span className="banner-preview">
                  {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            className="banner-close-btn"
            onClick={() => {
              if (selectedFile) setSelectedFile(null);
              else cancelEditOrReply();
            }}
          >
            ✕
          </button>
        </div>
      )}

      <form className="message-composer" onSubmit={handleSend}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          className="icon-btn composer-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile || !!editingMsg}
          title={t("attachFileTitle")}
        >
          📎
        </button>

        <div className="composer-input-wrap">
          <input
            type="text"
            placeholder={
              uploadingFile
                ? t("uploadingFile")
                : editingMsg
                  ? t("editMessagePlaceholder")
                  : t("typeMessagePlaceholder")
            }
            value={text}
            onChange={handleTextChange}
            disabled={uploadingFile}
          />
          <button
            type="button"
            className="icon-btn emoji-toggle-btn"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            title="Emoji"
          >
            😀
          </button>

          {showEmojiPicker && (
            <div className="emoji-picker-popover">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setText((prev) => `${prev}${em}`);
                    setShowEmojiPicker(false);
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="send-msg-btn"
          disabled={uploadingFile}
          title={editingMsg ? t("saveTitle") : t("sendTitle")}
        >
          {uploadingFile ? "⏳" : editingMsg ? "✓" : "➤"}
        </button>
      </form>
    </div>
  );
}
