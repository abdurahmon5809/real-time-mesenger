const { isSessionExpired } = require("../../lib/session-state");

async function disconnectExpiredSessionSockets(io, Session, now = new Date()) {
  const sockets = [...io.sockets.sockets.values()].filter(
    (client) => client.data.userId && client.data.sessionId,
  );
  const checked = new Set();
  let disconnectedCount = 0;

  for (const client of sockets) {
    const sessionId = String(client.data.sessionId);
    if (checked.has(sessionId)) continue;
    checked.add(sessionId);
    const session = await Session.findOne({
      _id: sessionId,
      userId: client.data.userId,
    }).select("revokedAt expiresAt").lean();

    if (!isSessionExpired(session, now)) continue;
    for (const sessionSocket of sockets.filter(
      (candidate) => String(candidate.data.sessionId) === sessionId,
    )) {
      // Keep userId/sessionId intact until the disconnect handler has removed
      // this socket from the user's persisted socketIds list.
      sessionSocket.emit("session_expired", {
        message: "Sessiya muddati tugagan. Qayta kiring.",
      });
      sessionSocket.disconnect(true);
      disconnectedCount += 1;
    }
  }
  return disconnectedCount;
}

module.exports = { disconnectExpiredSessionSockets };
