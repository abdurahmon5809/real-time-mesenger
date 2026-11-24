function compareReadCursor(candidate, current) {
  if (!current) return 1;
  const candidateTime = new Date(candidate.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  if (candidateTime > currentTime) return 1;
  if (candidateTime < currentTime) return -1;
  const a = String(candidate.messageObjectId || "");
  const b = String(current.messageObjectId || "");
  return a > b ? 1 : a < b ? -1 : 0;
}

// Build a Mongo update that only advances a per-user group cursor. The
// comparison is part of the update filter, so concurrent stale requests cannot
// overwrite a newer cursor after reading an old value.
function buildReadCursorUpdate(userId, groupId, boundary, hasCursor) {
  const createdAt = new Date(boundary.createdAt);
  const messageObjectId = String(boundary.messageObjectId);
  const cursorPath = `groupReadCursor.${groupId}`;
  const legacyPath = `groupReadAt.${groupId}`;
  const conditions = [
    { [cursorPath]: { $exists: false }, [legacyPath]: { $exists: false } },
    { [`${cursorPath}.createdAt`]: { $lt: createdAt } },
    {
      [`${cursorPath}.createdAt`]: createdAt,
      [`${cursorPath}.messageObjectId`]: { $lt: messageObjectId },
    },
  ];
  if (!hasCursor) {
    conditions.push({
      [cursorPath]: { $exists: false },
      [legacyPath]: { $lte: createdAt },
    });
  }
  return {
    filter: { _id: userId, $or: conditions },
    update: {
      $set: {
        [cursorPath]: {
          createdAt,
          messageId: boundary.messageId,
          messageObjectId,
        },
      },
    },
  };
}

module.exports = { compareReadCursor, buildReadCursorUpdate };
