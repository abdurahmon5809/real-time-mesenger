function isSessionExpired(session, now = new Date()) {
  if (!session) return true;
  if (session.revokedAt) return true;
  return new Date(session.expiresAt).getTime() <= new Date(now).getTime();
}

module.exports = { isSessionExpired };
