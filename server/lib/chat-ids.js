const crypto = require('crypto');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const privateRoomId = (idA, idB) => {
  const [first, second] = [String(idA), String(idB)].sort();
  return `dm:${first}:${second}`;
};

const groupRoomId = (group) => `group:${String(group._id || group)}`;

module.exports = { hashToken, privateRoomId, groupRoomId };
