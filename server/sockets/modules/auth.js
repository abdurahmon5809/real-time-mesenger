// Socket event registrations extracted from the original handlers.
// Event names and payload contracts are intentionally preserved.
function registerAuthHandlers(socket, context) {
  const { io, User, Session, Message, Group, bcrypt, userView, safeAck, rateLimit, createSession, sendDirectory, groupRoomId, removeSocketIdsAndRefreshPresence } = context;
    socket.on("register", async ({ username, password } = {}, callback) => {
      try {
        if (
          !rateLimit(`register:${socket.handshake.address}`, 5, 15 * 60 * 1000)
        ) {
          return safeAck(callback, {
            success: false,
            message: "Juda ko‘p urinish. Keyinroq urinib ko‘ring.",
            code: "RATE_LIMIT",
          });
        }
        if (typeof username !== "string" || typeof password !== "string") {
          return safeAck(callback, {
            success: false,
            message: "Ma’lumot formati noto‘g‘ri.",
            code: "INVALID_PAYLOAD",
          });
        }
        const cleanName = username.trim();
        if (cleanName.length < 2 || cleanName.length > 32) {
          return safeAck(callback, {
            success: false,
            message: "Foydalanuvchi nomi 2–32 belgi bo‘lsin.",
            code: "INVALID_USERNAME",
          });
        }
        if (password.length < 6 || password.length > 128) {
          return safeAck(callback, {
            success: false,
            message: "Parol 6–128 belgi bo‘lsin.",
            code: "INVALID_PASSWORD",
          });
        }
        if (await User.exists({ username: cleanName })) {
          return safeAck(callback, {
            success: false,
            message: "Bu ism allaqachon band qilingan!",
            code: "USERNAME_TAKEN",
          });
        }
        const user = await User.create({
          username: cleanName,
          password: await bcrypt.hash(password, 10),
        });
        const { token } = await createSession(user);
        safeAck(callback, { success: true, token, user: userView(user) });
      } catch (error) {
        safeAck(callback, {
          success: false,
          code: error.code === 11000 ? "USERNAME_TAKEN" : "REGISTER_ERROR",
          message:
            error.code === 11000
              ? "Bu ism allaqachon band qilingan!"
              : "Ro‘yxatdan o‘tishda server xatosi.",
        });
      }
    });

    socket.on("login", async ({ username, password } = {}, callback) => {
      try {
        if (
          !rateLimit(`login:${socket.handshake.address}`, 10, 15 * 60 * 1000)
        ) {
          return safeAck(callback, {
            success: false,
            message: "Juda ko‘p login urinishlari. Keyinroq urinib ko‘ring.",
            code: "RATE_LIMIT",
          });
        }
        if (
          typeof username !== "string" ||
          typeof password !== "string" ||
          !username.trim() ||
          !password
        ) {
          return safeAck(callback, {
            success: false,
            message: "Foydalanuvchi nomi va parolni kiriting.",
            code: "MISSING_CREDENTIALS",
          });
        }
        const user = await User.findOne({ username: username.trim() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
          return safeAck(callback, {
            success: false,
            message: "Ism yoki parol xato!",
            code: "INVALID_CREDENTIALS",
          });
        }
        const { token } = await createSession(user);
        safeAck(callback, { success: true, token, user: userView(user) });
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Server xatosi!",
          code: "LOGIN_ERROR",
        });
      }
    });

    socket.on("logout", async (_payload, callback) => {
      try {
        // Even an already-expired session must be able to clean up its online
        // socket presence; do not require the session to still be valid here.
        const user = socket.data.userId ? await User.findById(socket.data.userId) : null;
        if (socket.data.sessionId) {
          await Session.updateOne(
            { _id: socket.data.sessionId },
            { $set: { revokedAt: new Date() } },
          );
        }
        const revokedSessionId = socket.data.sessionId;
        const sessionSockets = revokedSessionId
          ? [...io.sockets.sockets.values()].filter(
              (client) => client.data.sessionId === revokedSessionId,
            )
          : [];
        if (user) {
          const sessionSocketIds = sessionSockets.map((client) => client.id);
          await removeSocketIdsAndRefreshPresence(User, user._id, sessionSocketIds);
        }
        safeAck(callback, { success: true });
        for (const client of sessionSockets) {
          client.data.userId = null;
          client.data.sessionId = null;
          client.emit("session_expired");
          client.disconnect(true);
        }
        await sendDirectory();
      } catch (error) {
        safeAck(callback, {
          success: false,
          message: "Chiqishda xatolik.",
          code: "LOGOUT_ERROR",
        });
      }
    });


}

module.exports = { registerAuthHandlers };
