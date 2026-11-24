import test from "node:test";
import assert from "node:assert/strict";
import { canJoinProtectedRoom } from "../src/utils/session-gate.js";
import { isCurrentChatResponse } from "../src/utils/request-guard.js";
import { isSubmittedDraftStillCurrent, shouldClearDraftAfterSend } from "../src/utils/draft-state.js";

test("protected room join waits for both connection and restored session", () => {
  assert.equal(canJoinProtectedRoom(true, false), false);
  assert.equal(canJoinProtectedRoom(false, true), false);
  assert.equal(canJoinProtectedRoom(true, true), true);
});

test("delayed send acknowledgement cannot clear a newer draft or file", () => {
  assert.equal(isSubmittedDraftStillCurrent("hello", "hello", null, null), true);
  assert.equal(isSubmittedDraftStillCurrent("new text", "hello", null, null), false);
  const oldFile = { name: "old.png" };
  const newFile = { name: "new.png" };
  assert.equal(isSubmittedDraftStillCurrent("hello", "hello", newFile, oldFile), false);
});

test("send rejection or timeout never clears the user's draft", () => {
  assert.equal(shouldClearDraftAfterSend({ success: false }, "keep me", "keep me", null, null), false);
  assert.equal(shouldClearDraftAfterSend(null, "keep me", "keep me", null, null), false);
  assert.equal(shouldClearDraftAfterSend({ success: true }, "new text", "old text", null, null), false);
  assert.equal(shouldClearDraftAfterSend({ success: true }, "same", "same", null, null), true);
});

test("late room/history responses cannot replace the currently selected chat", () => {
  assert.equal(isCurrentChatResponse({ requestId: "A", room: "dm:A" }, "B", "dm:B"), false);
  assert.equal(isCurrentChatResponse({ requestId: "B", room: "dm:A" }, "B", "dm:B"), false);
  assert.equal(isCurrentChatResponse({ requestId: "B", room: "dm:B" }, "B", "dm:B"), true);
});
