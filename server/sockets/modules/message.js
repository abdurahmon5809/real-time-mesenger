// Socket event registrations extracted from the original handlers.
// Event names and payload contracts are intentionally preserved.
function registerMessageHandlers(socket, context) {
  const { io, User, Session, Message, Group, UploadedFile, mongoose, crypto, safeAck, requireUser, getSocketUser, rateLimit, validId, validString, resolveRoom, authorizeRoomFromCurrent, validateMessageText, buildReadCursorUpdate, groupRoomId, isLatestRequest, typingTimers, sendDirectory } = context;
    socket.on(
      "load_older_messages",
      async ({ room, before, beforeId } = {}, callback) => {
        const user = await requireUser(socket, callback);
        if (!user) return;
        try {
          const authorized = await authorizeRoomFromCurrent(socket, user, room);
          if (!authorized)
            return safeAck(callback, {
              success: false,
              message: "Chat tarixiga ruxsat yo‘q.",
              code: "FORBIDDEN_ROOM",
            });
          const cursor = before ? new Date(before) : new Date();
          if (Number.isNaN(cursor.getTime()))
            return safeAck(callback, {
              success: false,
              message: "Sana kursori noto‘g‘ri.",
              code: "INVALID_CURSOR",
            });

          const filter = { room: authorized.room };
          if (beforeId && validId(beforeId)) {
            const objId = new mongoose.Types.ObjectId(String(beforeId));
            filter.$or = [
              { createdAt: { $lt: cursor } },
              { createdAt: cursor, _id: { $lt: objId } },
            ];
          } else {
            filter.createdAt = { $lt: cursor };
          }

          const history = await Message.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(50)
            .lean();
          history.reverse();
          safeAck(callback, {
            success: true,
            room: authorized.room,
            history,
            hasMore: history.length === 50,
          });
        } catch (error) {
          safeAck(callback, {
            success: false,
            message: "Eski xabarlarni yuklab bo‘lmadi.",
            code: "HISTORY_ERROR",
          });
        }
      },
    );

    socket.on("send_message", async (data = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        if (!data || typeof data !== "object") {
          return safeAck(callback, {
            success: false,
            message: "Xabar ma’lumotlari noto‘g‘ri.",
            code: "INVALID_PAYLOAD",
          });
        }
        if (!rateLimit(`message:${user._id}`, 60, 60 * 1000)) {
          return safeAck(callback, {
            success: false,
            message: "Juda tez xabar yuboryapsiz. Biroz kuting.",
            code: "RATE_LIMIT",
          });
        }
        const resolved = await resolveRoom(user, {
          target: data.isGroup ? data.groupId || data.target : data.target,
          isGroup: !!data.isGroup,
        });
        if (
          !resolved ||
          socket.data.currentRoom !== resolved.roomId ||
          !socket.rooms.has(resolved.roomId)
        ) {
          return safeAck(callback, {
            success: false,
            message: "Bu chatga xabar yuborish huquqingiz yo‘q.",
            code: "FORBIDDEN_ROOM",
          });
        }

        const textValidation = validateMessageText(data.text, { allowEmpty: true });
        if (!textValidation.success) return safeAck(callback, textValidation);
        const text = textValidation.text;
        const fileMatch =
          typeof data.file === "string"
            ? data.file.match(/^\/api\/files\/([0-9a-f-]{36})$/i)
            : null;
        const file = fileMatch ? data.file : null;
        if (!text && !file) {
          return safeAck(callback, {
            success: false,
            message: "Bo‘sh xabar yuborib bo‘lmaydi.",
            code: "EMPTY_MESSAGE",
          });
        }
        if (data.file && !file) {
          return safeAck(callback, {
            success: false,
            message:
              "Avval faylni xavfsiz yuklang yoki fayl manzili noto‘g‘ri.",
            code: "INVALID_FILE",
          });
        }

        let verifiedUpload = null;
        if (fileMatch) {
          const fileId = fileMatch[1];
          verifiedUpload = await UploadedFile.findOne({ fileId });
          if (!verifiedUpload) {
            return safeAck(callback, {
              success: false,
              message: "Yuklangan fayl topilmadi.",
              code: "FILE_NOT_FOUND",
            });
          }
          if (String(verifiedUpload.ownerId) !== String(user._id)) {
            return safeAck(callback, {
              success: false,
              message: "Bu fayl sizga tegishli emas!",
              code: "FILE_OWNER_MISMATCH",
            });
          }
          if (verifiedUpload.room !== resolved.roomId) {
            return safeAck(callback, {
              success: false,
              message: "Fayl boshqa chat uchun yuklangan!",
              code: "FILE_ROOM_MISMATCH",
            });
          }
        }

        const clientMessageId = validString(data.clientMessageId, 80)
          ? data.clientMessageId
          : null;
        if (clientMessageId) {
          const existing = await Message.findOne({
            senderId: user._id,
            clientMessageId,
          });
          if (existing)
            return safeAck(callback, {
              success: true,
              message: existing,
              duplicate: true,
            });
        }

        const safeReply =
          data.replyTo && typeof data.replyTo === "object"
            ? {
                sender: String(data.replyTo.sender || "").slice(0, 64),
                text: String(data.replyTo.text || "").slice(0, 500),
              }
            : null;

        const msg = await Message.create({
          id: crypto.randomUUID(),
          ...(clientMessageId ? { clientMessageId } : {}),
          room: resolved.roomId,
          senderId: user._id,
          receiverId: resolved.targetUser ? resolved.targetUser._id : undefined,
          sender: user.username,
          receiver: resolved.targetUser
            ? resolved.targetUser.username
            : resolved.group.name,
          text,
          file,
          fileName: verifiedUpload
            ? verifiedUpload.fileName
            : String(data.fileName || "").slice(0, 255),
          fileType: verifiedUpload
            ? verifiedUpload.fileType
            : String(data.fileType || "").slice(0, 100),
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isRead: false,
          isEdited: false,
          replyTo: safeReply,
          reactions: {},
        });

        if (verifiedUpload) {
          verifiedUpload.attached = true;
          await verifiedUpload.save();
        }

        if (resolved.group) {
          io.to(resolved.roomId).emit("receive_message", msg);
          for (const memberId of resolved.group.memberIds || []) {
            io.to(`user:${String(memberId)}`).emit("receive_message", msg);
          }
        } else {
          io.to(`user:${String(resolved.targetUser._id)}`).emit(
            "receive_message",
            msg,
          );
          io.to(`user:${String(user._id)}`).emit("receive_message", msg);
        }
        safeAck(callback, { success: true, message: msg });
        void sendDirectory().catch((error) => console.error("Directory refresh after send failed:", error.message));
      } catch (error) {
        if (error.code === 11000 && validString(data.clientMessageId, 80)) {
          const existing = await Message.findOne({
            senderId: user._id,
            clientMessageId: data.clientMessageId,
          });
          if (existing)
            return safeAck(callback, {
              success: true,
              message: existing,
              duplicate: true,
            });
        }
        safeAck(callback, {
          success: false,
          message: "Xabar yuborishda xatolik.",
          code: "SEND_MESSAGE_ERROR",
        });
      }
    });

    socket.on("mark_read", async ({ room, upToMessageId } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized) {
          return safeAck(callback, {
            success: false,
            message: "O‘qilganlikni belgilashga ruxsat yo‘q.",
            code: "FORBIDDEN_ROOM",
          });
        }
        if (authorized.group) {
          const gId = String(authorized.group._id);
          const boundary = await Message.findOne({
            id: String(upToMessageId || ""),
            room: authorized.room,
          }).select("_id createdAt id").lean();
          if (!boundary) return safeAck(callback, {
            success: false,
            message: "O‘qilganlik chegarasi uchun xabar topilmadi.",
            code: "MESSAGE_NOT_FOUND",
          });
          const existingUser = await User.findById(user._id).select("groupReadCursor");
          const currentCursor = existingUser?.groupReadCursor?.get(gId);
          const cursorUpdate = buildReadCursorUpdate(
            user._id,
            gId,
            {
              createdAt: boundary.createdAt,
              messageId: boundary.id,
              messageObjectId: String(boundary._id),
            },
            Boolean(currentCursor),
          );
          // The filter performs the monotonic comparison atomically in MongoDB.
          await User.updateOne(cursorUpdate.filter, cursorUpdate.update);
          void sendDirectory().catch((error) => console.error("Directory refresh after group read failed:", error.message));
          return safeAck(callback, { success: true, upToMessageId: boundary.id });
        }
        const lastMessage = await Message.findOne({
          id: String(upToMessageId || ""),
          room: authorized.room,
          receiverId: user._id,
        });
        if (!lastMessage)
          return safeAck(callback, {
            success: false,
            message: "Xabar topilmadi.",
            code: "MESSAGE_NOT_FOUND",
          });

        await Message.updateMany(
          {
            room: authorized.room,
            receiverId: user._id,
            isRead: false,
            $or: [
              { createdAt: { $lt: lastMessage.createdAt } },
              {
                createdAt: lastMessage.createdAt,
                _id: { $lte: lastMessage._id },
              },
            ],
          },
          { $set: { isRead: true } },
        );
        io.to(authorized.room).emit("messages_read", {
          readerId: String(user._id),
          room: authorized.room,
          upToMessageId: lastMessage.id,
        });
        safeAck(callback, { success: true });
        void sendDirectory().catch((error) => console.error("Directory refresh after private read failed:", error.message));
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "O‘qilganlik holatini saqlab bo‘lmadi.",
          code: "MARK_READ_ERROR",
        });
      }
    });

    socket.on("typing", async ({ room } = {}) => {
      const user = await getSocketUser(socket);
      if (!user) return;
      const authorized = await authorizeRoomFromCurrent(socket, user, room);
      if (!authorized) return;
      const typingKey = `${user._id}:${authorized.room}`;
      if (typingTimers.has(typingKey))
        clearTimeout(typingTimers.get(typingKey));
      typingTimers.set(
        typingKey,
        setTimeout(() => {
          typingTimers.delete(typingKey);
          io.to(authorized.room).emit("hide_typing", {
            username: user.username,
            userId: String(user._id),
            room: authorized.room,
          });
        }, 3000),
      );
      socket.to(authorized.room).emit("display_typing", {
        username: user.username,
        userId: String(user._id),
        room: authorized.room,
      });
    });

    socket.on("stop_typing", async ({ room } = {}) => {
      const user = await getSocketUser(socket);
      if (!user) return;
      const authorized = await authorizeRoomFromCurrent(socket, user, room);
      if (!authorized) return;
      const typingKey = `${user._id}:${authorized.room}`;
      if (typingTimers.has(typingKey))
        clearTimeout(typingTimers.get(typingKey));
      typingTimers.delete(typingKey);
      socket.to(authorized.room).emit("hide_typing", {
        username: user.username,
        userId: String(user._id),
        room: authorized.room,
      });
    });

    socket.on("delete_message", async ({ msgId, room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized)
          return safeAck(callback, {
            success: false,
            message: "Chatga ruxsat yo‘q.",
            code: "FORBIDDEN_ROOM",
          });
        const msg = await Message.findOne({
          id: String(msgId || ""),
          room: authorized.room,
        });
        if (!msg)
          return safeAck(callback, {
            success: false,
            message: "Xabar topilmadi.",
            code: "MESSAGE_NOT_FOUND",
          });
        const ownsMessage = String(msg.senderId) === String(user._id);
        const isGroupAdmin =
          authorized.group &&
          String(authorized.group.adminId) === String(user._id);
        if (!ownsMessage && !isGroupAdmin) {
          return safeAck(callback, {
            success: false,
            code: "FORBIDDEN_DELETE",
            message:
              "Faqat o‘z xabaringizni (yoki admin sifatida guruh xabarini) o‘chira olasiz.",
          });
        }
        await Message.deleteOne({ _id: msg._id });
        io.to(authorized.room).emit("message_deleted", {
          room: authorized.room,
          msgId: msg.id,
        });
        safeAck(callback, { success: true });
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Xabarni o‘chirishda xatolik.",
          code: "DELETE_MESSAGE_ERROR",
        });
      }
    });

    socket.on(
      "edit_message",
      async ({ msgId, newText, room } = {}, callback) => {
        const user = await requireUser(socket, callback);
        if (!user) return;
        try {
          const editValidation = validateMessageText(newText, { allowEmpty: false });
          if (!editValidation.success) return safeAck(callback, editValidation);
          const authorized = await authorizeRoomFromCurrent(socket, user, room);
          if (!authorized)
            return safeAck(callback, {
              success: false,
              message: "Chatga ruxsat yo‘q.",
              code: "FORBIDDEN_ROOM",
            });
          const msg = await Message.findOne({
            id: String(msgId || ""),
            room: authorized.room,
            senderId: user._id,
          });
          if (!msg)
            return safeAck(callback, {
              success: false,
              message: "Faqat o‘z xabaringizni tahrirlay olasiz.",
              code: "FORBIDDEN_EDIT",
            });
          msg.text = editValidation.text;
          msg.isEdited = true;
          await msg.save();
          io.to(authorized.room).emit("message_updated", {
            room: authorized.room,
            message: msg,
          });
          safeAck(callback, { success: true, message: msg });
        } catch (error) {
          safeAck(callback, {
            success: false,
            message: "Xabarni tahrirlashda xatolik.",
            code: "EDIT_MESSAGE_ERROR",
          });
        }
      },
    );

    socket.on(
      "toggle_reaction",
      async ({ msgId, emoji, room } = {}, callback) => {
        const user = await requireUser(socket, callback);
        if (!user) return;
        try {
          const authorized = await authorizeRoomFromCurrent(socket, user, room);
          if (!authorized)
            return safeAck(callback, {
              success: false,
              message: "Chatga ruxsat yo‘q.",
              code: "FORBIDDEN_ROOM",
            });
          const msg = await Message.findOne({
            id: String(msgId || ""),
            room: authorized.room,
          });
          if (!msg)
            return safeAck(callback, {
              success: false,
              message: "Xabar topilmadi.",
              code: "MESSAGE_NOT_FOUND",
            });
          const reaction =
            typeof emoji === "string" ? emoji.trim().slice(0, 12) : "";
          if (!reaction)
            return safeAck(callback, {
              success: false,
              message: "Reaksiya noto‘g‘ri.",
              code: "INVALID_REACTION",
            });

          const uid = String(user._id);
          const reactors = msg.reactions.get(reaction) || [];
          const uidIndex = reactors.indexOf(uid);
          if (uidIndex >= 0) {
            reactors.splice(uidIndex, 1);
          } else {
            reactors.push(uid);
          }

          if (reactors.length) msg.reactions.set(reaction, reactors);
          else msg.reactions.delete(reaction);

          await msg.save();
          io.to(authorized.room).emit("message_updated", {
            room: authorized.room,
            message: msg,
          });
          safeAck(callback, { success: true, message: msg });
        } catch (error) {
          safeAck(callback, {
            success: false,
            message: "Reaksiyani saqlashda xatolik.",
            code: "REACTION_ERROR",
          });
        }
      },
    );

    socket.on("clear_chat", async ({ room } = {}, callback) => {
      const user = await requireUser(socket, callback);
      if (!user) return;
      try {
        const authorized = await authorizeRoomFromCurrent(socket, user, room);
        if (!authorized)
          return safeAck(callback, {
            success: false,
            message: "Chatga ruxsat yo‘q.",
            code: "FORBIDDEN_ROOM",
          });
        if (
          authorized.group &&
          String(authorized.group.adminId) !== String(user._id)
        ) {
          return safeAck(callback, {
            success: false,
            message: "Guruh tarixini faqat admin tozalashi mumkin.",
            code: "FORBIDDEN_CLEAR",
          });
        }
        await Message.deleteMany({ room: authorized.room });
        io.to(authorized.room).emit("load_history", {
          room: authorized.room,
          history: [],
        });
        io.to(authorized.room).emit("chat_cleared", { room: authorized.room });
        safeAck(callback, { success: true });
        void sendDirectory().catch((error) => console.error("Directory refresh after clear failed:", error.message));
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Chat tarixini tozalashda xatolik.",
          code: "CLEAR_CHAT_ERROR",
        });
      }
    });


}

module.exports = { registerMessageHandlers };
