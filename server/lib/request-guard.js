function isLatestRequest(incomingRequestId, currentRequestId) {
  return incomingRequestId === currentRequestId;
}

module.exports = { isLatestRequest };
