async function dropLegacySparseClientMessageIndex(messageCollection) {
  const indexes = await messageCollection.indexes().catch(() => []);
  const legacyIndex = indexes.find((index) => {
    const keys = Object.keys(index.key || {});
    return index.unique === true &&
      index.sparse === true &&
      keys.length === 2 &&
      keys.includes("senderId") &&
      keys.includes("clientMessageId") &&
      index.key.senderId === 1 &&
      index.key.clientMessageId === 1;
  });
  if (!legacyIndex) return false;
  await messageCollection.dropIndex(legacyIndex.name);
  return true;
}

module.exports = { dropLegacySparseClientMessageIndex };
