// Socket event registrations extracted from the original handlers.
// Event names and payload contracts are intentionally preserved.
function registerProfileHandlers(socket, context) {
  const { io, User, Session, Message, Group, userView, safeAck, requireUser, sendDirectory, groupRoomId } = context;
    socket.on("update_profile", async (payload = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        if (!payload || typeof payload !== "object") {
          return safeAck(callback, {
            success: false,
            message: "Noto‘g‘ri profil ma’lumotlari.",
            code: "INVALID_PAYLOAD",
          });
        }
        const oldUsername = user.username;
        const newUsername = String(payload.newUsername || user.username).trim();
        if (newUsername.length < 2 || newUsername.length > 32) {
          return safeAck(callback, {
            success: false,
            message: "Ism 2–32 belgi bo‘lishi kerak.",
            code: "INVALID_USERNAME",
          });
        }
        if (
          newUsername !== user.username &&
          (await User.exists({ username: newUsername, _id: { $ne: user._id } }))
        ) {
          return safeAck(callback, {
            success: false,
            message: "Bu ism band qilingan!",
            code: "USERNAME_TAKEN",
          });
        }
        user.username = newUsername;
        if (typeof payload.bio === "string") {
          if (payload.bio.length > 500) {
            return safeAck(callback, {
              success: false,
              message: "Bio 500 belgidan oshmasligi kerak.",
              code: "BIO_TOO_LONG",
            });
          }
          user.bio = payload.bio;
        }
        await user.save();

        await Message.updateMany(
          { senderId: user._id },
          { $set: { sender: user.username } },
        );
        await Message.updateMany(
          { receiverId: user._id },
          { $set: { receiver: user.username } },
        );
        await Group.updateMany(
          { adminId: user._id },
          { $set: { admin: user.username } },
        );
        await Group.updateMany(
          { memberIds: user._id },
          { $pull: { members: oldUsername } },
        );
        await Group.updateMany(
          { memberIds: user._id },
          { $addToSet: { members: user.username } },
        );

        safeAck(callback, {
          success: true,
          newUsername: user.username,
          user: userView(user),
        });
        await sendDirectory();
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Profilni saqlashda xatolik.",
          code: "PROFILE_UPDATE_ERROR",
        });
      }
    });

    socket.on("delete_account", async (_payload, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const id = user._id;
        await Promise.all([
          Session.updateMany(
            { userId: id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
          ),
          Message.deleteMany({ $or: [{ senderId: id }, { receiverId: id }] }),
          Group.updateMany(
            { memberIds: id },
            { $pull: { memberIds: id, members: user.username } },
          ),
        ]);
        const adminGroups = await Group.find({ adminId: id });
        for (const group of adminGroups) {
          const nextAdminId = (group.memberIds || []).find(
            (memberId) => String(memberId) !== String(id),
          );
          if (nextAdminId) {
            const nextAdmin = await User.findById(nextAdminId);
            group.adminId = nextAdminId;
            group.admin = nextAdmin ? nextAdmin.username : "";
            await group.save();
          } else {
            await Message.deleteMany({ room: groupRoomId(group) });
            await Group.deleteOne({ _id: group._id });
          }
        }
        await User.deleteOne({ _id: id });

        safeAck(callback, { success: true });

        for (const s of io.sockets.sockets.values()) {
          if (s.data.userId === String(id)) {
            s.data.userId = null;
            s.data.sessionId = null;
            s.emit("session_expired");
            s.disconnect(true);
          }
        }
        await sendDirectory();
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Akkauntni o‘chirishda xatolik!",
          code: "DELETE_ACCOUNT_ERROR",
        });
      }
    });


}

module.exports = { registerProfileHandlers };
