const MAX_MESSAGE_LENGTH = 10000;

function validateMessageText(value, { allowEmpty = true } = {}) {
  if (value == null && allowEmpty) return { success: true, text: "" };
  if (typeof value !== "string") {
    return { success: false, code: "INVALID_MESSAGE_TEXT", message: "Xabar matni noto‘g‘ri." };
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return {
      success: false,
      code: "MESSAGE_TOO_LONG",
      maxLength: MAX_MESSAGE_LENGTH,
      message: "Xabar 10 000 belgidan oshmasligi kerak.",
    };
  }
  const text = value.trim();
  if (!allowEmpty && !text) {
    return { success: false, code: "EMPTY_MESSAGE", message: "Xabar matni bo‘sh bo‘lishi mumkin emas." };
  }
  return { success: true, text };
}

module.exports = { MAX_MESSAGE_LENGTH, validateMessageText };
