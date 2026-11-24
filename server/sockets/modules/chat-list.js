const mongoose = require("mongoose");

async function buildUserSummaries(userDocOrId, visibleGroups, { User, Message }) {
  const userObj =
    typeof userDocOrId === "object" && userDocOrId?._id
      ? userDocOrId
      : await User.findById(userDocOrId, "groupReadAt groupReadCursor");
  const userIdStr = String(userObj._id);
  const userObjId = new mongoose.Types.ObjectId(userIdStr);
  const groupRooms = visibleGroups.map((g) => `group:${g._id}`);
  const dmRegex = new RegExp(`^dm:.*${userIdStr}.*$`);

  const latestMessages = await Message.aggregate([
    { $match: { $or: [{ room: { $in: groupRooms } }, { room: { $regex: dmRegex } }] } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $group: { _id: "$room", lastMessage: { $first: "$$ROOT" } } },
  ]);

  const dmUnreadAgg = await Message.aggregate([
    { $match: { room: { $regex: dmRegex }, receiverId: userObjId, isRead: false } },
    { $group: { _id: "$room", count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(dmUnreadAgg.map((item) => [item._id, item.count]));
  const readMap = userObj.groupReadAt instanceof Map
    ? userObj.groupReadAt
    : new Map(Object.entries(userObj.groupReadAt || {}));
  const cursorMap = userObj.groupReadCursor instanceof Map
    ? userObj.groupReadCursor
    : new Map(Object.entries(userObj.groupReadCursor || {}));

  for (const group of visibleGroups) {
    const groupId = String(group._id);
    const room = `group:${groupId}`;
    const cursor = cursorMap.get(groupId);
    const legacyReadAt = readMap.get(groupId);
    const boundaryDate = cursor?.createdAt
      ? new Date(cursor.createdAt)
      : legacyReadAt ? new Date(legacyReadAt) : new Date(0);
    const boundaryId = cursor?.messageObjectId ? String(cursor.messageObjectId) : null;
    const boundaryObjectId = boundaryId && mongoose.isValidObjectId(boundaryId)
      ? new mongoose.Types.ObjectId(boundaryId)
      : null;
    const unreadFilter = {
      room,
      senderId: { $ne: userObjId },
      ...(boundaryObjectId
        ? { $or: [
            { createdAt: { $gt: boundaryDate } },
            { createdAt: boundaryDate, _id: { $gt: boundaryObjectId } },
          ] }
        : { createdAt: { $gt: boundaryDate } }),
    };
    unreadMap.set(room, await Message.countDocuments(unreadFilter));
  }

  const summaries = {};
  for (const item of latestMessages) {
    summaries[item._id] = {
      lastMessage: item.lastMessage,
      unreadCount: unreadMap.get(item._id) || 0,
    };
  }
  for (const [room, count] of unreadMap.entries()) {
    if (!summaries[room]) summaries[room] = { lastMessage: null, unreadCount: count };
    else summaries[room].unreadCount = count;
  }
  return summaries;
}

function createChatDirectoryService({ io, User, Group, Message, userView, groupView }) {
  const sendDirectoryForSocket = async (client, users, groups) => {
    if (!client.data.userId) return;
    // Include the cursor field: without it, group unread counts fall back to
    // the legacy timestamp and can drift after the cursor migration.
    const userDoc = await User.findById(client.data.userId, "groupReadAt groupReadCursor");
    if (!userDoc) return;
    const visibleGroups = groups.filter((group) =>
      String(group.adminId || "") === String(client.data.userId) ||
      (group.memberIds || []).some((memberId) => String(memberId) === String(client.data.userId))
    );
    const summaries = await buildUserSummaries(userDoc, visibleGroups, { User, Message });
    client.emit("update_users_and_groups", {
      users: users.map(userView),
      groups: visibleGroups.map(groupView),
      summaries,
    });
    client.emit("group_created", visibleGroups.map(groupView));
  };

  const sendDirectory = async () => {
    const [users, groups] = await Promise.all([
      User.find({}, "username avatar bio isOnline groupReadAt groupReadCursor").sort({ username: 1 }),
      Group.find({}).sort({ name: 1 }),
    ]);
    for (const client of io.sockets.sockets.values()) {
      await sendDirectoryForSocket(client, users, groups);
    }
  };

  return { sendDirectory, sendDirectoryForSocket };
}

module.exports = { buildUserSummaries, createChatDirectoryService };
