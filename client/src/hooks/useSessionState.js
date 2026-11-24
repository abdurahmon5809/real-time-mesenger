import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_BIO } from "../utils/constants";

export function useSessionState({ onClearAccountState } = {}) {
  const [currentUser, setCurrentUser] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [myAvatar, setMyAvatar] = useState("");
  const [myBio, setMyBio] = useState(DEFAULT_BIO);
  const [authError, setAuthError] = useState("");
  const currentUserRef = useRef(currentUser);
  const currentUserIdRef = useRef(currentUserId);

  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  const clearSessionState = useCallback((notice = "") => {
    currentUserRef.current = "";
    currentUserIdRef.current = "";
    setCurrentUser("");
    setCurrentUserId("");
    setAuthToken("");
    setMyAvatar("");
    setMyBio(DEFAULT_BIO);
    setAuthError(notice || "");
    onClearAccountState?.();
  }, [onClearAccountState]);

  return {
    currentUser,
    currentUserId,
    authToken,
    myAvatar,
    myBio,
    authError,
    currentUserRef,
    currentUserIdRef,
    setCurrentUser,
    setCurrentUserId,
    setAuthToken,
    setMyAvatar,
    setMyBio,
    setAuthError,
    clearSessionState,
  };
}
