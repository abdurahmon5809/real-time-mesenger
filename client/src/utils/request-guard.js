export function isCurrentChatResponse(payload, expectedRequestId, expectedRoom = "") {
  if (!payload || payload.requestId !== expectedRequestId) return false;
  if (expectedRoom && payload.room !== expectedRoom) return false;
  return true;
}
