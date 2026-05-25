import { resolveAttachmentTokens, uniqueAttachmentToken, withLeadingSpace } from "../input/attachment-tokens.mjs";

export function createTuiInputController({ editor, requestRender, historyStore = null, onSubmit = null }) {
  let onSubmitResolve = null;
  const attachmentTokens = new Map();

  return {
    readline() {
      return new Promise((resolve) => {
        onSubmitResolve = resolve;
        editor.disableSubmit = false;
        editor.onSubmit = (text) => {
          const resolvedText = resolveAttachmentTokens(text, attachmentTokens);
          if (attachmentTokens.size === 0) {
            editor.addToHistory(text);
            saveHistory();
          }
          clearSubmitState();
          attachmentTokens.clear();
          onSubmit?.();
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

    clearInput() {
      attachmentTokens.clear();
      editor.lastAction = null;
      editor.historyIndex = -1;
      setEditorText("");
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

  function saveHistory() {
    try {
      historyStore?.save?.(editor.history);
    } catch {}
  }

  function setEditorText(text) {
    if (typeof editor.setTextInternal === "function") {
      editor.setTextInternal(text);
      return;
    }
    editor.setText?.(text);
  }
}
