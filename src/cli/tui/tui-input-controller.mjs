import { resolveAttachmentTokens, uniqueAttachmentToken, withLeadingSpace } from "../input/attachment-tokens.mjs";

export function createTuiInputController({ editor, requestRender }) {
  let onSubmitResolve = null;
  const attachmentTokens = new Map();

  return {
    readline() {
      return new Promise((resolve) => {
        onSubmitResolve = resolve;
        editor.disableSubmit = false;
        editor.onSubmit = (text) => {
          const resolvedText = resolveAttachmentTokens(text, attachmentTokens);
          editor.addToHistory(text);
          clearSubmitState();
          attachmentTokens.clear();
          resolve(resolvedText);
        };
      });
    },

    requestExit() {
      if (!onSubmitResolve) return;
      const resolve = onSubmitResolve;
      clearSubmitState();
      attachmentTokens.clear();
      resolve(null);
    },

    getInputText() {
      return editor.getText();
    },

    insertTextAtCursor(text) {
      editor.insertTextAtCursor(text);
      requestRender();
    },

    insertAttachmentAtCursor({ marker, label }) {
      const token = uniqueAttachmentToken(label || "[image]", attachmentTokens);
      attachmentTokens.set(token, marker);
      editor.insertTextAtCursor(withLeadingSpace(editor.getText(), token));
      requestRender();
    },
  };

  function clearSubmitState() {
    editor.disableSubmit = true;
    editor.onSubmit = undefined;
    onSubmitResolve = null;
  }
}
