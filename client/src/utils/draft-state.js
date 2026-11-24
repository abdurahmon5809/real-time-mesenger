export function isSubmittedDraftStillCurrent(currentText, submittedText, currentFile, submittedFile) {
  return currentText === submittedText && currentFile === submittedFile;
}

export function shouldClearDraftAfterSend(result, currentText, submittedText, currentFile, submittedFile) {
  return Boolean(
    result?.success &&
    isSubmittedDraftStillCurrent(currentText, submittedText, currentFile, submittedFile),
  );
}
