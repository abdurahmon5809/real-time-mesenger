import React from "react";
import { emojiList, SERVER_URL } from "../utils/constants";

const resolveAvatar = (av) => {
  if (!av) return "";
  if (av.startsWith("http") || av.startsWith("data:") || av.startsWith("blob:")) return av;
  return `${SERVER_URL}${av}`;
};

export default function ChatArea({
  activeChat,
  closeActiveChat,
  currentPartner,
  typingStatus,
  t,
  handleClearChat,
  handleLeaveOrDeleteGroup,
  handleDeleteChat,
  messagesContainerRef,
  handleMessagesScroll,
  messages,
  userId,
  username,
  handleContextMenu,
  privateFileUrls,
  setActiveMedia,
  openPrivateFile,
  handleToggleReaction,
  reactionPickerMsgId,
  setReactionPickerMsgId,
  messagesEndRef,
  contextMenu,
  handleStartReply,
  handleStartEdit,
  handleDeleteMessage,
  replyingToMsg,
  setReplyingToMsg,
  editingMsgId,
  setEditingMsgId,
  setMessage,
  sendMessage,
  showEmojiPicker,
  setShowEmojiPicker,
  addEmoji,
  handleFileUpload,
  message,
  handleMessageChange,
}) {
  if (!activeChat) {
    return (
      <div className="tg-chat-area">
        <div className="tg-no-chat-selected">
          <div className="tg-select-hint">{t.selectChatHint}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-chat-area">
      <div className="tg-chat-header">
        <button className="tg-back-btn" onClick={closeActiveChat}>
          ←
        </button>
        {activeChat.isGroup ? (
          <div className="tg-avatar group-avatar">👥</div>
        ) : currentPartner?.avatar ? (
          <img
            src={resolveAvatar(currentPartner.avatar)}
            alt="Avatar"
            className="tg-avatar-img"
          />
        ) : (
          <div className="tg-avatar">{activeChat.name[0].toUpperCase()}</div>
        )}
        <div className="tg-chat-header-info">
          <h4>{activeChat.name}</h4>
          <span className="tg-sub-status">
            {typingStatus
              ? typingStatus
              : activeChat.isGroup
              ? "Guruh"
              : currentPartner?.isOnline
              ? t.online
              : t.offline}
          </span>
        </div>
        <div className="tg-chat-header-actions">
          <button
            title={t.clearChat}
            onClick={handleClearChat}
            className="tg-action-btn"
          >
            🧹
          </button>
          {activeChat.isGroup ? (
            <button
              title={t.deleteGroup}
              onClick={handleLeaveOrDeleteGroup}
              className="tg-action-btn danger"
            >
              🚪
            </button>
          ) : (
            <button
              title={t.deleteChat}
              onClick={handleDeleteChat}
              className="tg-action-btn danger"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div
        className="tg-messages-container"
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
        <div className="tg-messages-list">
          {messages.map((msg, index) => {
            const isOwn =
              (msg.senderId && String(msg.senderId) === String(userId)) ||
              (!msg.senderId && msg.sender === username);

            return (
              <div
                key={msg.id || index}
                className={`tg-message-bubble ${isOwn ? "out" : "in"}`}
                onContextMenu={(e) => handleContextMenu(e, msg)}
              >
                {msg.replyTo && (
                  <div className="tg-reply-preview-box">
                    <span className="tg-reply-sender">{msg.replyTo.sender}</span>
                    <span className="tg-reply-text">{msg.replyTo.text}</span>
                  </div>
                )}

                {msg.file && (
                  <div className="tg-file-container">
                    {msg.fileType && msg.fileType.startsWith("image/") ? (
                      <img
                        src={
                          privateFileUrls[msg.id] ||
                          (msg.file.startsWith("data:") ? msg.file : "")
                        }
                        alt="Media"
                        className="tg-message-image"
                        onClick={() =>
                          setActiveMedia(privateFileUrls[msg.id] || msg.file)
                        }
                      />
                    ) : (
                      <div className="tg-document-box">
                        <span className="tg-doc-icon">📄</span>
                        <div className="tg-doc-info">
                          <span className="tg-doc-name">
                            {msg.fileName || "Fayl"}
                          </span>
                          <button
                            type="button"
                            onClick={() => openPrivateFile(msg.file, msg.fileName)}
                            className="tg-doc-download"
                          >
                            {t.download} ⬇
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeChat.isGroup && !isOwn && (
                  <div className="tg-group-msg-sender">{msg.sender}</div>
                )}

                {msg.text && <div className="tg-message-text">{msg.text}</div>}

                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="tg-reactions-container">
                    {Object.entries(msg.reactions).map(([emoji, reactors], idx) => {
                      const reactedByMe =
                        reactors.includes(String(userId)) ||
                        reactors.includes(username);
                      return (
                        <span
                          key={idx}
                          className={`tg-reaction-badge ${
                            reactedByMe ? "active" : ""
                          }`}
                          onClick={() => handleToggleReaction(msg.id, emoji)}
                        >
                          {emoji} {reactors.length}
                        </span>
                      );
                    })}
                  </div>
                )}

                <div className="tg-message-footer">
                  {msg.isEdited && (
                    <span className="tg-edited-label">{t.edited}</span>
                  )}
                  <span className="tg-message-time">{msg.time}</span>
                  {isOwn && (
                    <span
                      className={`tg-read-receipt ${
                        msg.isRead ? "read" : "unread"
                      }`}
                    >
                      {msg.isRead ? "✓✓" : "✓"}
                    </span>
                  )}
                  <button
                    className="tg-reaction-trigger-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReactionPickerMsgId(
                        reactionPickerMsgId === msg.id ? null : msg.id
                      );
                    }}
                  >
                    ➕
                  </button>
                </div>

                {reactionPickerMsgId === msg.id && (
                  <div
                    className="tg-reaction-popover"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {emojiList.map((emo, eIdx) => (
                      <span
                        key={eIdx}
                        onClick={() => handleToggleReaction(msg.id, emo)}
                      >
                        {emo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {contextMenu && (
        <div
          className="tg-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => handleStartReply(contextMenu.msg)}>
            <span>↩️</span> {t.reply}
          </button>
          {((contextMenu.msg.senderId &&
            String(contextMenu.msg.senderId) === String(userId)) ||
            (!contextMenu.msg.senderId &&
              contextMenu.msg.sender === username)) &&
            contextMenu.msg.text && (
              <button onClick={() => handleStartEdit(contextMenu.msg)}>
                <span>✏️</span> {t.edit}
              </button>
            )}
          <button
            onClick={() => handleDeleteMessage(contextMenu.msg.id)}
            className="delete-action"
          >
            <span>🗑️</span> {t.delete}
          </button>
        </div>
      )}

      {replyingToMsg && (
        <div className="tg-editing-bar">
          <div>
            <span style={{ fontWeight: "bold" }}>
              ↩️ {replyingToMsg.sender}:{" "}
            </span>
            <span>{replyingToMsg.text || "Fayl"}</span>
          </div>
          <button onClick={() => setReplyingToMsg(null)}>✕</button>
        </div>
      )}

      {editingMsgId && (
        <div className="tg-editing-bar">
          <span>✏️ Xabarni tahrirlash</span>
          <button
            onClick={() => {
              setEditingMsgId(null);
              setMessage("");
            }}
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={sendMessage} className="tg-message-input-area">
        <div className="tg-emoji-picker-container">
          <button
            type="button"
            className="tg-emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            😊
          </button>
          {showEmojiPicker && (
            <div className="tg-emoji-popover">
              {emojiList.map((emo, idx) => (
                <span key={idx} onClick={() => addEmoji(emo)}>
                  {emo}
                </span>
              ))}
            </div>
          )}
        </div>
        <label
          htmlFor="file-input"
          className="tg-attach-btn"
          title="Fayl biriktirish"
        >
          📎
        </label>
        <input
          id="file-input"
          type="file"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
        <input
          type="text"
          placeholder={t.typeMessage}
          value={message}
          onChange={handleMessageChange}
        />
        <button type="submit" className="tg-send-btn">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
