import React, { useState, useEffect } from "react";
import { API_URL, DEFAULT_BIO } from "../utils/constants";
import { getAvatarColor, getInitials, resolveAvatar } from "../utils/media";

function ModalAvatar({ name, avatar, size = 72 }) {
  const src = resolveAvatar(avatar);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name || "Avatar"}
        className="avatar-img"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className="avatar-placeholder"
      style={{
        width: size,
        height: size,
        backgroundColor: getAvatarColor(name),
        fontSize: Math.max(14, Math.floor(size * 0.36)),
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export function CreateGroupModal({
  users,
  currentUser,
  currentUserId,
  onClose,
  onCreate,
  t = (k) => k,
}) {
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const otherUsers = users.filter((u) => {
    const uname = typeof u === "string" ? u : u.username;
    const uid = typeof u === "string" ? "" : u.id || u.userId || "";
    return !(
      (currentUserId && uid && uid === currentUserId) ||
      uname === currentUser
    );
  });

  const toggleMember = (memberId) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((m) => m !== memberId)
        : [...prev, memberId],
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = groupName.trim();
    if (!trimmed) {
      setErrorMsg(t("errEnterGroupName"));
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    onCreate(trimmed, selectedMembers, (res) => {
      setSubmitting(false);
      if (res?.success) {
        onClose();
      } else {
        setErrorMsg(res?.message || t("errCreateGroup"));
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("createGroupModalTitle")}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {errorMsg && <div className="modal-error-banner">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>{t("groupNameLabel")}</label>
            <input
              type="text"
              placeholder={t("groupNamePlaceholder")}
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>
              {t("selectMembersLabel", { count: selectedMembers.length })}
            </label>
            <div className="member-select-list">
              {otherUsers.length === 0 ? (
                <div className="empty-list-hint">{t("noUsersFound")}</div>
              ) : (
                otherUsers.map((u) => {
                  const uname = typeof u === "string" ? u : u.username;
                  const uid =
                    typeof u === "string" ? uname : u.id || u.userId || uname;
                  const checked = selectedMembers.includes(uid);
                  return (
                    <label
                      key={uid}
                      className={`member-select-item ${checked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(uid)}
                      />
                      <ModalAvatar
                        name={uname}
                        avatar={typeof u === "object" ? u.avatar : ""}
                        size={32}
                      />
                      <span>{uname}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              {t("cancel")}
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProfileModal({
  currentUser,
  currentUserId,
  avatar,
  bio,
  token,
  onClose,
  onSaveProfile,
  onDeleteAccount,
  t = (k) => k,
}) {
  const [username, setUsername] = useState(currentUser || "");
  const [bioText, setBioText] = useState(bio || DEFAULT_BIO);
  const [avatarPreview, setAvatarPreview] = useState(avatar || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setAvatarPreview(avatar || "");
  }, [avatar]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg("");

    if (!file.type.startsWith("image/")) {
      setErrorMsg(t("errOnlyImages"));
      e.target.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(t("errImageTooBig"));
      e.target.value = "";
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await fetch(`${API_URL}/api/avatar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-file-type": file.type,
        },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.avatar) {
        setErrorMsg(data.message || t("errAvatarUpload"));
      } else {
        setAvatarPreview(data.avatar);
      }
    } catch {
      setErrorMsg(t("errServerConnect"));
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (saving || uploadingAvatar) return;
    const trimmed = username.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
      setErrorMsg(t("errUsernameLength"));
      return;
    }
    setErrorMsg("");
    setSaving(true);
    onSaveProfile(
      { newUsername: trimmed, bio: bioText, avatar: avatarPreview },
      (res) => {
        setSaving(false);
        if (res?.success) {
          onClose();
        } else {
          setErrorMsg(res?.message || t("errProfileSave"));
        }
      },
    );
  };

  const handleConfirmDelete = () => {
    if (saving) return;
    setSaving(true);
    onDeleteAccount((res) => {
      setSaving(false);
      if (!res?.success) {
        setErrorMsg(res?.message || t("errDeleteAccount"));
        setConfirmDelete(false);
      }
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("profileModalTitle")}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {errorMsg && <div className="modal-error-banner">{errorMsg}</div>}

        <form onSubmit={handleSave} className="modal-body">
          <div className="profile-avatar-center">
            <ModalAvatar
              name={username || currentUser}
              avatar={avatarPreview}
              size={84}
            />
            <label className="avatar-upload-btn">
              {uploadingAvatar ? t("uploading") : t("changeAvatar")}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarChange}
                disabled={uploadingAvatar || saving}
              />
            </label>
            {currentUserId && (
              <span className="profile-id-hint">ID: {currentUserId}</span>
            )}
          </div>

          <div className="form-group">
            <label>{t("usernameLabel")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
            />
          </div>

          <div className="form-group">
            <label>{t("bioLabel")}</label>
            <textarea
              rows={3}
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="modal-footer space-between">
            {!confirmDelete ? (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                {t("deleteAccount")}
              </button>
            ) : (
              <div className="confirm-inline">
                <span>{t("confirmDeleteAsk")}</span>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleConfirmDelete}
                  disabled={saving}
                >
                  {t("yesDelete")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("no")}
                </button>
              </div>
            )}

            <div className="footer-right-group">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={saving}
              >
                {t("close")}
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving || uploadingAvatar}
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GroupInfoModal({
  group,
  currentUser,
  currentUserId,
  users,
  onClose,
  onRemoveMember,
  onDeleteOrLeave,
  t = (k) => k,
}) {
  const [errorMsg, setErrorMsg] = useState("");
  const [busyMember, setBusyMember] = useState("");

  if (!group) return null;

  const isAdmin =
    (currentUserId &&
      group.adminId &&
      String(group.adminId) === String(currentUserId)) ||
    group.admin === currentUser;

  const membersList = Array.isArray(group.members) ? group.members : [];
  const memberIdsList = Array.isArray(group.memberIds) ? group.memberIds : [];

  const handleRemove = (memberName, idx) => {
    const memberId = memberIdsList[idx] || "";
    setErrorMsg("");
    setBusyMember(memberId || memberName);
    onRemoveMember(
      {
        groupId: group.id || group.groupId,
        groupName: group.name,
        memberId,
        memberUsername: memberName,
      },
      (res) => {
        setBusyMember("");
        if (!res?.success) {
          setErrorMsg(res?.message || t("errRemoveMember"));
        }
      },
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("groupInfoModalTitle")}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {errorMsg && <div className="modal-error-banner">{errorMsg}</div>}

        <div className="modal-body">
          <div className="group-info-top">
            <ModalAvatar name={group.name} avatar={group.avatar} size={64} />
            <div>
              <h4 className="group-info-title">{group.name}</h4>
              <p className="group-info-sub">
                {t("adminLabel")}:{" "}
                <strong>{group.admin || t("unknown")}</strong> •{" "}
                {t("membersCount", { count: membersList.length })}
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>{t("membersListLabel")}</label>
            <div className="group-members-list">
              {membersList.map((mName, idx) => {
                const mId = memberIdsList[idx] || "";
                const isMemberAdmin =
                  (mId &&
                    group.adminId &&
                    String(mId) === String(group.adminId)) ||
                  mName === group.admin;
                const isSelf =
                  (mId &&
                    currentUserId &&
                    String(mId) === String(currentUserId)) ||
                  mName === currentUser;

                const matchedUser = users.find((u) =>
                  typeof u === "object"
                    ? u.id === mId || u.username === mName
                    : u === mName,
                );

                return (
                  <div
                    key={`${mId || mName}-${idx}`}
                    className="group-member-row"
                  >
                    <div className="group-member-left">
                      <ModalAvatar
                        name={mName}
                        avatar={
                          typeof matchedUser === "object"
                            ? matchedUser?.avatar
                            : ""
                        }
                        size={34}
                      />
                      <div>
                        <span className="member-name-text">{mName}</span>
                        {isMemberAdmin && (
                          <span className="role-badge admin">
                            {t("adminLabel")}
                          </span>
                        )}
                        {isSelf && (
                          <span className="role-badge me">{t("youBadge")}</span>
                        )}
                      </div>
                    </div>

                    {isAdmin && !isMemberAdmin && !isSelf && (
                      <button
                        type="button"
                        className="btn-danger-small"
                        disabled={busyMember === (mId || mName)}
                        onClick={() => handleRemove(mName, idx)}
                      >
                        {busyMember === (mId || mName)
                          ? "..."
                          : t("removeMember")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-footer space-between">
            <button
              type="button"
              className="btn-danger-outline"
              onClick={() => {
                onClose();
                onDeleteOrLeave &&
                  onDeleteOrLeave(group.id || group.name, isAdmin);
              }}
            >
              {isAdmin ? t("deleteGroup") : t("leaveGroup")}
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({
  theme,
  onToggleTheme,
  wallpaper,
  onChangeWallpaper,
  language,
  onChangeLanguage,
  soundEnabled,
  onToggleSound,
  onClose,
  t = (k) => k,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("settings")}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body settings-body">
          <div className="setting-row">
            <div>
              <div className="setting-title">{t("darkMode")}</div>
              <div className="setting-desc">{t("darkModeDesc")}</div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onToggleTheme}
            >
              {theme === "dark" ? `🌙 ${t("enabled")}` : `☀️ ${t("disabled")}`}
            </button>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">{t("wallpaper")}</div>
              <div className="setting-desc">{t("wallpaperDesc")}</div>
            </div>
            <div className="segmented-btns">
              <button
                type="button"
                className={wallpaper === "doodle" ? "active" : ""}
                onClick={() => onChangeWallpaper("doodle")}
              >
                {t("doodle")}
              </button>
              <button
                type="button"
                className={wallpaper === "plain" ? "active" : ""}
                onClick={() => onChangeWallpaper("plain")}
              >
                {t("plain")}
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">{t("language")}</div>
              <div className="setting-desc">{t("languageDesc")}</div>
            </div>
            <div className="segmented-btns">
              <button
                type="button"
                className={language === "uz" ? "active" : ""}
                onClick={() => onChangeLanguage("uz")}
              >
                O‘zbek
              </button>
              <button
                type="button"
                className={language === "en" ? "active" : ""}
                onClick={() => onChangeLanguage("en")}
              >
                English
              </button>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-title">{t("sound")}</div>
              <div className="setting-desc">{t("soundDesc")}</div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onToggleSound}
            >
              {soundEnabled ? `🔔 ${t("enabled")}` : `🔕 ${t("disabled")}`}
            </button>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-primary" onClick={onClose}>
              {t("done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaViewerModal({
  mediaUrl,
  fileName = "image.jpg",
  onClose,
  t = (k) => k,
}) {
  const safeUrl =
    typeof mediaUrl === "string" &&
    (mediaUrl.startsWith("http://") ||
      mediaUrl.startsWith("https://") ||
      mediaUrl.startsWith("blob:"))
      ? mediaUrl
      : "";

  if (!safeUrl) return null;

  return (
    <div className="media-viewer-backdrop" onClick={onClose}>
      <div
        className="media-viewer-toolbar"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={safeUrl}
          download={fileName || "image.jpg"}
          className="media-download-btn"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("downloadBtn")}
        </a>
        <button type="button" className="media-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="media-viewer-stage" onClick={(e) => e.stopPropagation()}>
        <img
          src={safeUrl}
          alt={fileName || "Preview"}
          className="media-viewer-img"
        />
      </div>
    </div>
  );
}
