function dedupeLegacyMessageIdentity(message, seenMessageIds, seenClientPairs, createId) {
  if (!message.id || seenMessageIds.has(message.id)) {
    message.id = createId();
  }
  seenMessageIds.add(message.id);

  if (typeof message.clientMessageId === "string") {
    const normalizedClientId = message.clientMessageId.trim();
    message.clientMessageId = normalizedClientId || undefined;
  }
  if (message.clientMessageId && message.senderId) {
    const pairKey = `${String(message.senderId)}:${message.clientMessageId}`;
    if (seenClientPairs.has(pairKey)) message.clientMessageId = undefined;
    else seenClientPairs.add(pairKey);
  }
  return message;
}

module.exports = { dedupeLegacyMessageIdentity };
