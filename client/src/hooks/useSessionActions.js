import { DEFAULT_BIO } from "../utils/constants";

export function useSessionActions({
  socket,
  currentUserRef,
  currentUserIdRef,
  setCurrentUser,
  setCurrentUserId,
  setAuthToken,
  setMyAvatar,
  setMyBio,
  setAuthError,
  setChatError,
  bumpRoomGeneration,
  setPendingJoin,
  clearSessionState,
  t,
}) {
  const handleAuthSuccess = ({ username, userId, token, avatar, bio }) => {
    currentUserRef.current = username;
    currentUserIdRef.current = userId;
    setCurrentUser(username);
    setCurrentUserId(userId);
    setAuthToken(token);
    setMyAvatar(avatar || "");
    setMyBio(bio || DEFAULT_BIO);
    setAuthError("");
    setChatError("");
    setPendingJoin(null);

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
      setPendingJoin(null);
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
        setPendingJoin(null);
        clearSessionState(t("accountDeletedNotice"));
        if (socket.connected) socket.disconnect();
      }
    });
  };


  return { handleAuthSuccess, handleLogout, handleDeleteAccount };
}
