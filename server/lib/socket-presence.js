async function removeSocketIdsAndRefreshPresence(User, userId, socketIds) {
  const ids = [...new Set((socketIds || []).filter(Boolean).map(String))];
  if (!ids.length) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

  // A single atomic pipeline avoids the race where a new socket connects
  // between a $pull, a read, and a later isOnline=false write.
  return User.updateOne({ _id: userId }, [
    {
      $set: {
        socketIds: {
          $filter: {
            input: { $ifNull: ["$socketIds", []] },
            as: "socketIdValue",
            cond: { $not: [{ $in: ["$$socketIdValue", ids] }] },
          },
        },
      },
    },
    {
      $set: {
        isOnline: { $gt: [{ $size: { $ifNull: ["$socketIds", []] } }, 0] },
        socketId: { $ifNull: [{ $arrayElemAt: ["$socketIds", -1] }, null] },
      },
    },
  ]);
}

module.exports = { removeSocketIdsAndRefreshPresence };
