import React, { useState } from "react";
import { getAvatarColor, getInitials, resolveAvatar } from "../utils/media";

function Avatar({ name, avatar, size = 48, isOnline = false }) {
  const src = resolveAvatar(avatar);
  const [imgError, setImgError] = useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [src]);

  return (
    <div className="avatar-wrapper" style={{ width: size, height: size, minWidth: size }}>
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
            fontSize: Math.max(12, Math.floor(size * 0.38))
          }}
        >
          {getInitials(name)}
        </div>
      )}
      {isOnline && <span className="online-badge" />}
    </div>
  );
}

export default function Sidebar({
  currentUser,
  currentUserId,
  myAvatar,
  users,
  groups,
  activeChat,
  onSelectChat,
  onOpenCreateGroup,
  onOpenProfile,
  onOpenSettings,
  onLogout,
  summaries = {},
  isConnected = true,
  t = (k) => k
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredUsers = users.filter((u) => {
    const uname = typeof u === "string" ? u : u.username;
    const uid = typeof u === "string" ? "" : (u.id || u.userId || "");
    const isSelf = (currentUserId && uid && uid === currentUserId) || uname === currentUser;
    return !isSelf && uname.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredGroups = groups.filter((g) => {
    const gname = typeof g === "string" ? g : g.name;
    return gname.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getSummaryKeyForUser = (u) => {
    const uid = typeof u === "string" ? "" : (u.id || u.userId || "");
    if (currentUserId && uid) {
      return `dm:${[String(currentUserId), String(uid)].sort().join(":")}`;
    }
    return "";
  };

  const getSummaryKeyForGroup = (g) => {
    const gid = typeof g === "string" ? "" : (g.id || g.groupId || "");
    return gid ? `group:${gid}` : "";
  };

  const formatLastMsg = (sum) => {
    if (!sum || !sum.lastMessage) return null;
    const lm = sum.lastMessage;
    if (lm.file) return lm.text || `📎 ${lm.fileName || t("attachedFile")}`;
    return lm.text || "";
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-left">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setMenuOpen((prev) => !prev)}
            title={t("menu")}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="current-user-pill" onClick={onOpenProfile} title={t("editProfileTitle")}>
            <Avatar name={currentUser} avatar={myAvatar} size={36} isOnline={isConnected} />
            <div className="current-user-info">
              <span className="current-user-name">{currentUser}</span>
              <span className="current-user-status">{isConnected ? t("online") : t("reconnecting")}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="icon-btn new-group-btn"
          onClick={onOpenCreateGroup}
          title={t("createGroupTitle")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="dropdown-menu">
              <button type="button" className="dropdown-item" onClick={() => { setMenuOpen(false); onOpenProfile(); }}>
                <span>👤</span> {t("myProfile")}
              </button>
              <button type="button" className="dropdown-item" onClick={() => { setMenuOpen(false); onOpenCreateGroup(); }}>
                <span>👥</span> {t("newGroup")}
              </button>
              <button type="button" className="dropdown-item" onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
                <span>⚙️</span> {t("settings")}
              </button>
              <div className="dropdown-divider" />
              <button type="button" className="dropdown-item danger" onClick={() => { setMenuOpen(false); onLogout(); }}>
                <span>🚪</span> {t("logout")}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="search-box-wrap">
        <div className="search-box">
          <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="clear-search-btn" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="chat-list">
        {filteredGroups.length > 0 && <div className="list-section-label">{t("groups")}</div>}
        {filteredGroups.map((grp) => {
          const gname = typeof grp === "string" ? grp : grp.name;
          const gid = typeof grp === "string" ? "" : (grp.id || grp.groupId || "");
          const isActive = activeChat?.isGroup && ((gid && activeChat.id === gid) || activeChat.name === gname);
          const sumKey = getSummaryKeyForGroup(grp);
          const sum = sumKey ? summaries[sumKey] : null;
          const previewText = formatLastMsg(sum);
          const unread = isActive ? 0 : (sum?.unreadCount || 0);
          const count = typeof grp === "object" && grp.members ? grp.members.length : 0;

          return (
            <div
              key={gid || gname}
              className={`chat-item ${isActive ? "active" : ""}`}
              onClick={() => onSelectChat({ id: gid, name: gname, isGroup: true, data: typeof grp === "object" ? grp : null })}
            >
              <Avatar name={gname} avatar={typeof grp === "object" ? grp.avatar : ""} size={48} />
              <div className="chat-item-body">
                <div className="chat-item-top">
                  <span className="chat-item-name">
                    <span className="group-tag">#</span> {gname}
                  </span>
                  {sum?.lastMessage?.time && (
                    <span className={`chat-item-time ${unread > 0 ? "unread" : ""}`}>
                      {sum.lastMessage.time}
                    </span>
                  )}
                </div>
                <div className="chat-item-bottom">
                  <span className="chat-item-preview">
                    {previewText || t("membersCount", { count })}
                  </span>
                  {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
                </div>
              </div>
            </div>
          );
        })}

        <div className="list-section-label">{t("users")}</div>
        {filteredUsers.length === 0 ? (
          <div className="empty-list-hint">{t("noUsersFound")}</div>
        ) : (
          filteredUsers.map((usr) => {
            const uname = typeof usr === "string" ? usr : usr.username;
            const uid = typeof usr === "string" ? "" : (usr.id || usr.userId || "");
            const isOnline = typeof usr === "object" ? !!usr.isOnline : false;
            const uAvatar = typeof usr === "object" ? usr.avatar : "";
            const isActive = !activeChat?.isGroup && ((uid && activeChat?.id === uid) || activeChat?.name === uname);
            const sumKey = getSummaryKeyForUser(usr);
            const sum = sumKey ? summaries[sumKey] : null;
            const previewText = formatLastMsg(sum);
            const unread = isActive ? 0 : (sum?.unreadCount || 0);

            return (
              <div
                key={uid || uname}
                className={`chat-item ${isActive ? "active" : ""}`}
                onClick={() => onSelectChat({ id: uid, name: uname, isGroup: false, data: typeof usr === "object" ? usr : null })}
              >
                <Avatar name={uname} avatar={uAvatar} size={48} isOnline={isOnline} />
                <div className="chat-item-body">
                  <div className="chat-item-top">
                    <span className="chat-item-name">{uname}</span>
                    {sum?.lastMessage?.time && (
                      <span className={`chat-item-time ${unread > 0 ? "unread" : ""}`}>
                        {sum.lastMessage.time}
                      </span>
                    )}
                  </div>
                  <div className="chat-item-bottom">
                    <span className="chat-item-preview">
                      {previewText || (typeof usr === "object" && usr.bio ? usr.bio : (isOnline ? t("online") : t("offline")))}
                    </span>
                    {unread > 0 && <span className="unread-badge">{unread > 99 ? "99+" : unread}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}