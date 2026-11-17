import React from "react";
import { SERVER_URL } from "../utils/constants";
import { getPrivateRoomId } from "../utils/socket";

const resolveAvatar = (av) => {
  if (!av) return "";
  if (av.startsWith("http") || av.startsWith("data:") || av.startsWith("blob:")) return av;
  return `${SERVER_URL}${av}`;
};

export default function Sidebar({
  username,
  userId,
  avatar,
  t,
  theme,
  toggleTheme,
  setIsCreateGroupOpen,
  setIsSettingsOpen,
  searchQuery,
  setSearchQuery,
  filteredGroups,
  filteredUsers,
  activeChat,
  handleSelectChat,
  typingUsers,
  chatSummaries,
}) {
  return (
    <div className="tg-sidebar">
      <div className="tg-sidebar-header">
        <div
          className="tg-user-profile"
          onClick={() => setIsSettingsOpen(true)}
          style={{ cursor: "pointer" }}
        >
          {avatar ? (
            <img src={resolveAvatar(avatar)} alt="Avatar" className="tg-avatar-img" />
          ) : (
            <div className="tg-avatar my-avatar">
              {username?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="tg-user-details">
            <span className="tg-my-username">{username}</span>
            <span className="tg-chat-status online">{t.online}</span>
          </div>
        </div>
        <div className="tg-header-actions">
          <button
            onClick={() => setIsCreateGroupOpen(true)}
            className="tg-create-group-btn"
            title={t.createGroup}
          >
            👥
          </button>
          <button onClick={toggleTheme} className="tg-theme-toggle-icon">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="tg-settings-icon"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="tg-search-bar">
        <input
          type="text"
          placeholder={t.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="tg-chats-list">
        {filteredGroups.map((group) => {
          const roomKey = group.roomId || `group:${group.groupId || group.id}`;
          const summary = chatSummaries[roomKey] || {};
          const unreadCount = summary.unreadCount || 0;
          const lastText = summary.lastMessage?.text
            ? summary.lastMessage.text
            : summary.lastMessage?.file
            ? "📎 Fayl"
            : `${group.members?.length || 0} ${t.membersCount}`;
          const lastTime = summary.lastMessage?.time || "";

          return (
            <div
              key={group.groupId || group.id}
              className={`tg-chat-item ${
                activeChat?.id === (group.groupId || group.id) ? "active" : ""
              }`}
              onClick={() => handleSelectChat(group, true)}
            >
              <div className="tg-avatar-container">
                <div className="tg-avatar group-avatar">👥</div>
              </div>
              <div className="tg-chat-info">
                <div className="tg-chat-top-row">
                  <span className="tg-chat-name">{group.name}</span>
                  {lastTime && <span className="tg-chat-time">{lastTime}</span>}
                </div>
                <div className="tg-chat-bottom-row">
                  <span className="tg-chat-status">{lastText}</span>
                  {unreadCount > 0 && (
                    <span className="tg-unread-badge">{unreadCount}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredUsers.map((user) => {
          const targetId = user.id || user.userId;
          const isTyping = typingUsers[targetId] || typingUsers[user.username];
          const roomKey = userId && targetId ? getPrivateRoomId(userId, targetId) : "";
          const summary = chatSummaries[roomKey] || {};
          const unreadCount = summary.unreadCount || 0;
          const lastText = isTyping
            ? t.typing
            : summary.lastMessage?.text
            ? summary.lastMessage.text
            : summary.lastMessage?.file
            ? "📎 Fayl"
            : user.isOnline
            ? t.online
            : t.offline;
          const lastTime = summary.lastMessage?.time || "";

          return (
            <div
              key={targetId || user.username}
              className={`tg-chat-item ${
                activeChat?.id === targetId || activeChat?.name === user.username
                  ? "active"
                  : ""
              }`}
              onClick={() => handleSelectChat(user, false)}
            >
              <div className="tg-avatar-container">
                {user.avatar ? (
                  <img
                    src={resolveAvatar(user.avatar)}
                    alt="Avatar"
                    className="tg-avatar-img"
                  />
                ) : (
                  <div className="tg-avatar">
                    {user.username[0].toUpperCase()}
                  </div>
                )}
                {user.isOnline && <span className="tg-online-badge"></span>}
              </div>
              <div className="tg-chat-info">
                <div className="tg-chat-top-row">
                  <span className="tg-chat-name">{user.username}</span>
                  {lastTime && <span className="tg-chat-time">{lastTime}</span>}
                </div>
                <div className="tg-chat-bottom-row">
                  <span
                    className={`tg-chat-status ${
                      isTyping ? "typing" : user.isOnline ? "online" : "offline"
                    }`}
                  >
                    {lastText}
                  </span>
                  {unreadCount > 0 && (
                    <span className="tg-unread-badge">{unreadCount}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
