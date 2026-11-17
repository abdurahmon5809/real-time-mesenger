import React from "react";
import { SERVER_URL } from "../utils/constants";

const resolveAvatar = (av) => {
  if (!av) return "";
  if (av.startsWith("http") || av.startsWith("data:") || av.startsWith("blob:")) return av;
  return `${SERVER_URL}${av}`;
};

export default function Modals({
  isCreateGroupOpen,
  setIsCreateGroupOpen,
  handleCreateGroup,
  t,
  newGroupName,
  setNewGroupName,
  allUsers,
  userId,
  selectedGroupMembers,
  setSelectedGroupMembers,
  isSettingsOpen,
  setIsSettingsOpen,
  avatar,
  username,
  handleSaveProfile,
  handleAvatarUpload,
  newUsername,
  setNewUsername,
  bio,
  setBio,
  theme,
  setTheme,
  wallpaper,
  setWallpaper,
  notifications,
  setNotifications,
  language,
  setLanguage,
  handleLogout,
  handleDeleteAccount,
  activeMedia,
  setActiveMedia,
}) {
  return (
    <>
      {isCreateGroupOpen && (
        <div
          className="tg-modal-overlay"
          onClick={() => setIsCreateGroupOpen(false)}
        >
          <div
            className="tg-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t.createGroup}</h3>
            <form onSubmit={handleCreateGroup}>
              <div className="tg-setting-group">
                <label>{t.groupName}</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Masalan: Dasturchilar"
                  required
                />
              </div>
              <div className="tg-setting-group tg-group-member-picker">
                <label>Guruh a’zolari</label>
                <div className="tg-group-member-list">
                  {allUsers
                    .filter((u) => String(u.id || u.userId) !== String(userId))
                    .map((u) => (
                      <label
                        className="tg-group-member-option"
                        key={u.id || u.userId}
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroupMembers.includes(
                            u.id || u.userId
                          )}
                          onChange={(e) =>
                            setSelectedGroupMembers((prev) =>
                              e.target.checked
                                ? [...prev, u.id || u.userId]
                                : prev.filter(
                                    (id) => id !== (u.id || u.userId)
                                  )
                            )
                          }
                        />
                        <span>{u.username}</span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="tg-modal-buttons">
                <button type="submit" className="tg-save-btn">
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateGroupOpen(false)}
                  className="tg-cancel-btn"
                >
                  {t.close}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div
          className="tg-modal-overlay"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="tg-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tg-settings-header-banner">
              {avatar ? (
                <img
                  src={resolveAvatar(avatar)}
                  alt="Avatar"
                  className="tg-settings-avatar"
                />
              ) : (
                <div className="tg-settings-avatar-placeholder">
                  {username?.[0]?.toUpperCase()}
                </div>
              )}
              <h3>{username}</h3>
              <span className="tg-settings-sub">{t.accountInfo}</span>
            </div>
            <form onSubmit={handleSaveProfile}>
              <div className="tg-setting-group">
                <label>{t.changeAvatar}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="tg-file-input"
                />
              </div>
              <div className="tg-setting-group">
                <label>{t.changeUsername}</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>
              <div className="tg-setting-group">
                <label>{t.bio}</label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
              <div className="tg-setting-group">
                <label>{t.theme}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="tg-theme-select"
                >
                  <option value="dark">{t.darkTheme}</option>
                  <option value="light">{t.lightTheme}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.chatWallpaper}</label>
                <select
                  value={wallpaper}
                  onChange={(e) => setWallpaper(e.target.value)}
                  className="tg-theme-select"
                >
                  <option value="doodle">{t.doodleWallpaper}</option>
                  <option value="plain">{t.defaultWallpaper}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.notifications}</label>
                <select
                  value={notifications ? "true" : "false"}
                  onChange={(e) => setNotifications(e.target.value === "true")}
                  className="tg-theme-select"
                >
                  <option value="true">{t.soundEnabled}</option>
                  <option value="false">{t.soundDisabled}</option>
                </select>
              </div>
              <div className="tg-setting-group">
                <label>{t.language}</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="tg-theme-select"
                >
                  <option value="uz">O'zbekcha 🇺🇿</option>
                  <option value="en">English 🇬🇧</option>
                </select>
              </div>
              <div className="tg-modal-buttons">
                <button type="submit" className="tg-save-btn">
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="tg-cancel-btn"
                >
                  {t.close}
                </button>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="tg-logout-btn-full"
              >
                🚪 {t.logout}
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="tg-delete-account-btn-full"
              >
                🗑️ {t.deleteAccount}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeMedia && (
        <div className="tg-media-viewer" onClick={() => setActiveMedia(null)}>
          <button className="tg-media-close">✕</button>
          <img
            src={activeMedia}
            alt="Full view"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={activeMedia}
            download="image.jpg"
            className="tg-media-download-btn"
            onClick={(e) => e.stopPropagation()}
          >
            {t.download} ⬇
          </a>
        </div>
      )}
    </>
  );
}
