// Socket event registrations extracted from the original handlers.
// Event names and payload contracts are intentionally preserved.
function registerGroupCreationHandlers(socket, context) {
  const { io, User, Group, mongoose, safeAck, requireUser, validId, groupView, sendDirectory } = context;
    socket.on("create_group", async ({ groupName, members } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const name = typeof groupName === "string" ? groupName.trim() : "";
        if (!name || name.length > 80) {
          return safeAck(callback, {
            success: false,
            message: "Guruh nomini kiriting (1–80 belgi).",
            code: "INVALID_GROUP_NAME",
          });
        }
        if (await Group.exists({ name })) {
          return safeAck(callback, {
            success: false,
            message: "Bu nomdagi guruh mavjud!",
            code: "GROUP_EXISTS",
          });
        }
        const selectedIds = Array.isArray(members)
          ? [...new Set(members.map(String).filter(validId))]
          : [];
        const selectedUsers = await User.find(
          { _id: { $in: selectedIds } },
          "_id username",
        );
        const memberIds = [
          ...new Set([
            String(user._id),
            ...selectedUsers.map((u) => String(u._id)),
          ]),
        ].map((id) => new mongoose.Types.ObjectId(id));
        const memberNames = [
          ...new Set([user.username, ...selectedUsers.map((u) => u.username)]),
        ];
        const group = await Group.create({
          name,
          adminId: user._id,
          memberIds,
          admin: user.username,
          members: memberNames,
        });
        const view = groupView(group);
        safeAck(callback, { success: true, group: view });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, {
          success: false,
          code: error.code === 11000 ? "GROUP_EXISTS" : "CREATE_GROUP_ERROR",
          message:
            error.code === 11000
              ? "Bu nomdagi guruh mavjud!"
              : "Guruh yaratishda xatolik!",
        });
      }
    });


}

// Socket event registrations extracted from the original handlers.
// Event names and payload contracts are intentionally preserved.
function registerGroupMembershipHandlers(socket, context) {
  const { io, User, Message, Group, safeAck, requireUser, validId, groupRoomId, sendDirectory } = context;
    socket.on(
      "delete_or_leave_group",
      async ({ groupId, groupName } = {}, callback) => {
        const user = await requireUser(socket, callback);
        if (!user) return;
        try {
          const group = await Group.findOne(
            validId(groupId || groupName)
              ? { _id: groupId || groupName }
              : { name: String(groupName || "") },
          );
          if (!group)
            return safeAck(callback, {
              success: false,
              message: "Guruh topilmadi.",
              code: "GROUP_NOT_FOUND",
            });
          const userIdStr = String(user._id);
          const roomId = groupRoomId(group);
          const isAdmin = String(group.adminId) === userIdStr;
          const isMember = (group.memberIds || []).some(
            (id) => String(id) === userIdStr,
          );
          if (!isMember)
            return safeAck(callback, {
              success: false,
              message: "Siz bu guruh a’zosi emassiz.",
              code: "NOT_GROUP_MEMBER",
            });

          if (isAdmin) {
            await Message.deleteMany({ room: roomId });
            await Group.deleteOne({ _id: group._id });
            io.to(roomId).emit("chat_deleted", { room: roomId });
            for (const memberId of group.memberIds || []) {
              io.to(`user:${String(memberId)}`).emit("chat_deleted", {
                room: roomId,
              });
            }
            for (const s of io.sockets.sockets.values()) {
              if (s.rooms.has(roomId)) {
                s.leave(roomId);
                if (s.data.currentRoom === roomId) s.data.currentRoom = null;
              }
            }
          } else {
            group.memberIds = group.memberIds.filter(
              (id) => String(id) !== userIdStr,
            );
            group.members = group.members.filter(
              (name) => name !== user.username,
            );
            await group.save();
            io.to(`user:${userIdStr}`).emit("chat_deleted", { room: roomId });
            for (const s of io.sockets.sockets.values()) {
              if (s.data.userId === userIdStr && s.rooms.has(roomId)) {
                s.leave(roomId);
                if (s.data.currentRoom === roomId) s.data.currentRoom = null;
              }
            }
          }
          safeAck(callback, { success: true });
          await sendDirectory();
        } catch (error) {
          safeAck(callback, {
            success: false,
            message: "Guruh amalida xatolik.",
            code: "GROUP_ACTION_ERROR",
          });
        }
      },
    );

    socket.on(
      "remove_group_member",
      async (
        { groupId, groupName, memberId, memberUsername } = {},
        callback,
      ) => {
        const user = await requireUser(socket, callback);
        if (!user) return;
        try {
          const group = await Group.findOne(
            validId(groupId || groupName)
              ? { _id: groupId || groupName }
              : { name: String(groupName || "") },
          );
          if (!group)
            return safeAck(callback, {
              success: false,
              message: "Guruh topilmadi.",
              code: "GROUP_NOT_FOUND",
            });
          if (String(group.adminId) !== String(user._id)) {
            return safeAck(callback, {
              success: false,
              message: "A’zoni faqat guruh admini chiqarishi mumkin.",
              code: "FORBIDDEN_REMOVE_MEMBER",
            });
          }
          const targetUser = validId(memberId)
            ? await User.findById(memberId)
            : await User.findOne({ username: String(memberUsername || "") });
          if (!targetUser || String(targetUser._id) === String(group.adminId)) {
            return safeAck(callback, {
              success: false,
              message: "A’zo topilmadi yoki adminni chiqarib bo‘lmaydi.",
              code: "INVALID_MEMBER",
            });
          }
          const targetIdStr = String(targetUser._id);
          const wasMember = (group.memberIds || []).some(
            (id) => String(id) === targetIdStr,
          );
          if (!wasMember)
            return safeAck(callback, {
              success: false,
              message: "Bu foydalanuvchi guruh a’zosi emas.",
              code: "NOT_GROUP_MEMBER",
            });

          group.memberIds = group.memberIds.filter(
            (id) => String(id) !== targetIdStr,
          );
          group.members = group.members.filter(
            (name) => name !== targetUser.username,
          );
          await group.save();

          const roomId = groupRoomId(group);
          io.to(`user:${targetIdStr}`).emit("chat_deleted", { room: roomId });
          for (const client of io.sockets.sockets.values()) {
            if (
              client.data.userId === targetIdStr &&
              client.rooms.has(roomId)
            ) {
              client.leave(roomId);
              if (client.data.currentRoom === roomId)
                client.data.currentRoom = null;
            }
          }
          safeAck(callback, { success: true });
          await sendDirectory();
        } catch (error) {
          safeAck(callback, {
            success: false,
            message: "A’zoni guruhdan chiqarishda xatolik.",
            code: "REMOVE_MEMBER_ERROR",
          });
        }
      },
    );


}

module.exports = { registerGroupCreationHandlers, registerGroupMembershipHandlers };
