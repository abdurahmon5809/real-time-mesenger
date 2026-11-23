import React, { useState } from "react";
import { socket } from "../utils/socket";

export default function AuthScreen({ onAuthSuccess, initialError = "", t = (k) => k }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState(initialError);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (initialError) setErrorMsg(initialError);
  }, [initialError]);

  const validateForm = () => {
    const cleanName = username.trim();
    if (!cleanName || !password) {
      return t("errEnterCredentials");
    }
    if (cleanName.length < 2 || cleanName.length > 32) {
      return t("errUsernameLength");
    }
    if (password.length < 6) {
      return t("errPasswordLength");
    }
    return "";
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    const validationErr = validateForm();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }

    setErrorMsg("");
    setLoading(true);

    const doEmit = () => {
      const eventName = isRegister ? "register" : "login";
      socket.emit(eventName, { username: username.trim(), password }, (res) => {
        setLoading(false);
        if (res?.success) {
          onAuthSuccess({
            username: res.user?.username || username.trim(),
            userId: res.user?.id || res.user?.userId || "",
            token: res.token,
            avatar: res.user?.avatar || "",
            bio: res.user?.bio || ""
          });
        } else {
          setErrorMsg(res?.message || t("errAuthFailed"));
        }
      });
    };

    if (!socket.connected) {
      socket.auth = {};
      socket.once("connect", doEmit);
      socket.once("connect_error", () => {
        setLoading(false);
        setErrorMsg(t("errServerConnect"));
      });
      socket.connect();
    } else {
      doEmit();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo-circle">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </div>

        <h1 className="auth-title">Telegram Web Pro</h1>
        <p className="auth-subtitle">
          {isRegister ? t("authRegisterSubtitle") : t("authLoginSubtitle")}
        </p>

        {errorMsg && <div className="auth-error-box" role="alert">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-input-group">
            <label>{t("usernameLabel")}</label>
            <input
              type="text"
              placeholder={t("usernamePlaceholder")}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="auth-input-group">
            <label>{t("passwordLabel")}</label>
            <input
              type="password"
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              disabled={loading}
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? t("pleaseWait") : isRegister ? t("registerBtn") : t("loginBtn")}
          </button>
        </form>

        <div className="auth-switch-footer">
          <span>{isRegister ? t("haveAccount") : t("noAccount")}</span>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMsg("");
            }}
            disabled={loading}
          >
            {isRegister ? t("loginBtn") : t("registerBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}