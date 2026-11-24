export function canJoinProtectedRoom(socketConnected, sessionRestored) {
  return Boolean(socketConnected && sessionRestored);
}
