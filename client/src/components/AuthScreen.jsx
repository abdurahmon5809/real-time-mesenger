import React from "react";

export default function AuthScreen({
  theme,
  handleAuth,
  isRegistering,
  setIsRegistering,
  authError,
  setAuthError,
  username,
  setUsername,
  password,
  setPassword,
}) {
  return (
    <div className={`tg-login-container ${theme}`}>
      <form onSubmit={handleAuth} className="tg-login-card">
        <div className="tg-logo">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="#2AABEE">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.69-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.38-.49 1.03-.75 4.03-1.75 6.72-2.91 8.07-3.47 3.83-1.6 4.63-1.88 5.15-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.13-.03.22z" />
          </svg>
        </div>
        <h2>Telegram Web Pro</h2>
        <p className="tg-subtitle">
          {isRegistering ? "Yangi hisob yaratish" : "Xush kelibsiz"}
        </p>
        {authError && <div className="tg-error-msg">{authError}</div>}
        <div className="tg-input-group">
          <input
            type="text"
            placeholder="Foydalanuvchi nomi"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="tg-input-group">
          <input
            type="password"
            placeholder="Parol"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="tg-btn">
          {isRegistering ? "RO'YXATDAN O'TISH" : "KIRISH"}
        </button>
        <p
          className="tg-switch-auth"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setAuthError("");
          }}
        >
          {isRegistering
            ? "Akkauntingiz bormi? Kirish"
            : "Hisobingiz yo'qmi? Ro'yxatdan o'tish"}
        </p>
      </form>
    </div>
  );
}
