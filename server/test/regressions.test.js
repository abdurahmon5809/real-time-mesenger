const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMessageText, MAX_MESSAGE_LENGTH } = require("../lib/message-validation");
const { compareReadCursor, buildReadCursorUpdate } = require("../lib/read-cursor");
const { migrateReactionOwners } = require("../lib/legacy-reactions");
const { dedupeLegacyMessageIdentity } = require("../lib/legacy-message-ids");
const { isLatestRequest } = require("../lib/request-guard");
const { isSessionExpired } = require("../lib/session-state");
const { disconnectExpiredSessionSockets } = require("../sockets/modules/session-expiry");
const { Message } = require("../models");

test("message limit accepts 10,000 and rejects 10,001 without truncating", () => {
  const accepted = "a".repeat(MAX_MESSAGE_LENGTH);
  const rejected = "b".repeat(MAX_MESSAGE_LENGTH + 1);
  assert.equal(validateMessageText(accepted).success, true);
  const result = validateMessageText(rejected);
  assert.equal(result.success, false);
  assert.equal(result.code, "MESSAGE_TOO_LONG");
  assert.equal(rejected.length, MAX_MESSAGE_LENGTH + 1);
});

test("group read cursor is monotonic by date and then ObjectId", () => {
  const later = { createdAt: "2026-01-02T00:00:00.000Z", messageObjectId: "000000000000000000000002" };
  const earlier = { createdAt: "2026-01-01T00:00:00.000Z", messageObjectId: "ffffffffffffffffffffffff" };
  const sameDateHigherId = { createdAt: later.createdAt, messageObjectId: "000000000000000000000003" };
  assert.equal(compareReadCursor(later, earlier), 1);
  assert.equal(compareReadCursor(earlier, later), -1);
  assert.equal(compareReadCursor(sameDateHigherId, later), 1);
  assert.equal(compareReadCursor(later, sameDateHigherId), -1);
});

test("legacy reaction usernames map to IDs; unknown owners are not assigned", () => {
  const users = new Map([["ali", { _id: "aaaaaaaaaaaaaaaaaaaaaaaa" }]]);
  const usersById = new Map([["bbbbbbbbbbbbbbbbbbbbbbbb", { _id: "bbbbbbbbbbbbbbbbbbbbbbbb" }]]);
  const result = migrateReactionOwners({ "❤️": ["ali", "bbbbbbbbbbbbbbbbbbbbbbbb", "unknown"] }, users, usersById);
  assert.deepEqual(result.migrated["❤️"], ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"]);
  assert.deepEqual(result.unresolved, [{ emoji: "❤️", value: "unknown", reason: "USER_NOT_FOUND" }]);
});


test("legacy message migration deduplicates message IDs and sender/client IDs", () => {
  const ids = new Set(["same-id"]);
  const pairs = new Set(["user-1:client-1"]);
  const duplicate = { id: "same-id", senderId: "user-1", clientMessageId: "client-1" };
  dedupeLegacyMessageIdentity(duplicate, ids, pairs, () => "generated-id");
  assert.equal(duplicate.id, "generated-id");
  assert.equal(duplicate.clientMessageId, undefined);
});

test("late chat responses are rejected when a newer request exists", () => {
  assert.equal(isLatestRequest("request-B", "request-B"), true);
  assert.equal(isLatestRequest("request-A", "request-B"), false);
});

test("idle session expiry detects revoked and expired sessions", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  assert.equal(isSessionExpired({ revokedAt: null, expiresAt: "2026-11-24T11:59:59Z" }, now), true);
  assert.equal(isSessionExpired({ revokedAt: now, expiresAt: "2026-11-25T12:00:00Z" }, now), true);
  assert.equal(isSessionExpired({ revokedAt: null, expiresAt: "2026-11-25T12:00:00Z" }, now), false);
});


test("group cursor update includes an atomic date+ObjectId forward-only filter", () => {
  const result = buildReadCursorUpdate("user-id", "group-id", {
    createdAt: "2026-11-24T10:00:00.000Z",
    messageId: "message-uuid",
    messageObjectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  }, true);
  assert.equal(result.filter._id, "user-id");
  assert.equal(result.filter.$or.length, 3);
  assert.equal(result.update.$set["groupReadCursor.group-id"].messageId, "message-uuid");
  assert.equal(result.filter.$or[2]["groupReadCursor.group-id.messageObjectId"].$lt, "aaaaaaaaaaaaaaaaaaaaaaaa");
});

test("message schema uses a partial unique index for sender/client IDs", () => {
  const indexes = Message.schema.indexes();
  const clientIndex = indexes.find(([keys, options]) => options.name === "uniq_sender_client_message_id");
  assert.ok(clientIndex, "partial unique client message index exists");
  assert.equal(clientIndex[1].unique, true);
  assert.equal(clientIndex[1].sparse, undefined);
  assert.equal(clientIndex[1].partialFilterExpression.senderId.$type, "objectId");
  assert.equal(clientIndex[1].partialFilterExpression.clientMessageId.$type, "string");
});

test("expired session disconnects every matching socket without clearing identity first", async () => {
  const seenQueries = [];
  const expired = { revokedAt: null, expiresAt: "2026-11-24T11:59:00.000Z" };
  const Session = {
    findOne(query) {
      seenQueries.push(query);
      const result = query._id === "session-1"
        ? expired
        : { revokedAt: null, expiresAt: "2026-11-25T12:00:00.000Z" };
      return { select() { return { lean: async () => result }; } };
    },
  };
  const disconnected = [];
  const makeSocket = (id) => ({
    id, data: { userId: "user-1", sessionId: "session-1" },
    emit(event) { assert.equal(event, "session_expired"); },
    disconnect(force) {
      assert.equal(force, true);
      assert.equal(this.data.userId, "user-1");
      assert.equal(this.data.sessionId, "session-1");
      disconnected.push(this.id);
    },
  });
  const first = makeSocket("socket-1");
  const second = makeSocket("socket-2");
  const other = { ...makeSocket("socket-3"), data: { userId: "user-2", sessionId: "session-2" } };
  const io = { sockets: { sockets: new Map([[first.id, first], [second.id, second], [other.id, other]]) } };
  const count = await disconnectExpiredSessionSockets(io, Session, new Date("2026-11-24T12:00:00.000Z"));
  assert.equal(count, 2);
  assert.deepEqual(disconnected.sort(), ["socket-1", "socket-2"]);
  assert.equal(seenQueries.length, 2);
});

test("socket feature modules register the existing event contracts synchronously", async () => {
  const { setupSocketHandlers } = require("../sockets/handlers");
  let connectionHandler;
  const io = {
    sockets: { sockets: new Map() },
    use() {},
    on(event, handler) {
      if (event === "connection") connectionHandler = handler;
    },
    to() { return { emit() {} }; },
  };
  const registered = new Map();
  const socket = {
    id: "test-socket",
    data: { userId: "user-1", sessionId: "session-1" },
    connected: true,
    handshake: { address: "127.0.0.1", auth: {} },
    rooms: new Set(["test-socket"]),
    on(event, handler) { registered.set(event, handler); return this; },
    emit() {},
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    to() { return { emit() {} }; },
    disconnect() { this.connected = false; },
  };
  const { User } = require("../models");
  const originalFindById = User.findById;
  let restoreLookupStarted = false;
  User.findById = () => {
    restoreLookupStarted = true;
    return new Promise(() => {}); // Hold async restore while checking listener registration.
  };
  const lifecycle = setupSocketHandlers(io);
  try {
    await connectionHandler(socket);
    assert.equal(restoreLookupStarted, true);
  } finally {
    lifecycle.stopSessionExpiry();
    User.findById = originalFindById;
  }

  for (const event of [
    "register", "login", "logout", "update_profile", "delete_account",
    "create_group", "join_room", "leave_room", "load_older_messages",
    "send_message", "mark_read", "typing", "stop_typing", "delete_message",
    "edit_message", "toggle_reaction", "clear_chat", "delete_or_leave_group",
    "remove_group_member", "disconnect",
  ]) {
    assert.ok(registered.has(event), `missing socket event: ${event}`);
  }
});

test("legacy avatar migration writes file before replacing DB URL and is idempotent", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { migrateLegacyAvatar } = require("../lib/avatar-migration");
  const avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), "messenger-avatar-"));
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const original = `data:image/png;base64,${bytes.toString("base64")}`;
    const user = {
      _id: "user-legacy",
      avatar: original,
      async save() { assert.match(this.avatar, /^\/uploads\/avatars\//); },
    };
    assert.equal(await migrateLegacyAvatar(user, avatarDir), true);
    assert.match(user.avatar, /^\/uploads\/avatars\/.+\.png$/);
    const stored = path.join(avatarDir, path.basename(user.avatar));
    assert.deepEqual(fs.readFileSync(stored), bytes);
    assert.equal(await migrateLegacyAvatar(user, avatarDir), false);
    assert.equal(fs.existsSync(stored), true);
  } finally {
    fs.rmSync(avatarDir, { recursive: true, force: true });
  }
});

test("failed avatar DB save keeps the old Base64 avatar and removes partial file", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { migrateLegacyAvatar } = require("../lib/avatar-migration");
  const avatarDir = fs.mkdtempSync(path.join(os.tmpdir(), "messenger-avatar-fail-"));
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const original = `data:image/png;base64,${bytes.toString("base64")}`;
    const user = { _id: "user-legacy", avatar: original, async save() { throw new Error("db failed"); } };
    await assert.rejects(() => migrateLegacyAvatar(user, avatarDir), /db failed/);
    assert.equal(user.avatar, original);
    assert.deepEqual(fs.readdirSync(avatarDir), []);
  } finally {
    fs.rmSync(avatarDir, { recursive: true, force: true });
  }
});

test("migration drops only the old sparse unique sender/client compound index", async () => {
  const { dropLegacySparseClientMessageIndex } = require("../lib/message-index-migration");
  const dropped = [];
  const collection = {
    async indexes() {
      return [
        { name: "legacy_sparse", unique: true, sparse: true, key: { senderId: 1, clientMessageId: 1 } },
        { name: "other_index", unique: true, sparse: false, key: { senderId: 1, clientMessageId: 1 } },
      ];
    },
    async dropIndex(name) { dropped.push(name); },
  };
  assert.equal(await dropLegacySparseClientMessageIndex(collection), true);
  assert.deepEqual(dropped, ["legacy_sparse"]);
});

test("socket presence cleanup recalculates online status in one atomic update", async () => {
  const { removeSocketIdsAndRefreshPresence } = require("../lib/socket-presence");
  let captured;
  const User = {
    async updateOne(filter, pipeline) {
      captured = { filter, pipeline };
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
  };
  await removeSocketIdsAndRefreshPresence(User, "user-1", ["socket-old", "socket-old"]);
  assert.deepEqual(captured.filter, { _id: "user-1" });
  assert.equal(captured.pipeline.length, 2);
  assert.deepEqual(captured.pipeline[0].$set.socketIds.$filter.cond.$not[0].$in, ["$$socketIdValue", ["socket-old"]]);
  assert.deepEqual(captured.pipeline[1].$set.isOnline, { $gt: [{ $size: { $ifNull: ["$socketIds", []] } }, 0] });
});

test("legacy reaction username that looks like an ObjectId is resolved safely", () => {
  const hexName = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const namedUser = { _id: "111111111111111111111111" };
  const differentIdUser = { _id: hexName };
  const usersByName = new Map([[hexName, namedUser]]);
  const usersById = new Map([[hexName, differentIdUser]]);
  const result = migrateReactionOwners({ "🔥": [hexName] }, usersByName, usersById);
  assert.deepEqual(result.migrated["🔥"], []);
  assert.deepEqual(result.unresolved, [{ emoji: "🔥", value: hexName, reason: "AMBIGUOUS_USERNAME_OR_USER_ID" }]);
});
