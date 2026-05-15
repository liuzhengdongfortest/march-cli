import { SelectList } from "@mariozechner/pi-tui";
import { EDITOR_THEME } from "../ui-theme.mjs";

export function showEditorSelectList({ tui, editor, items, selectedIndex = 0, maxVisible = 8, requestRender }) {
  if (!Array.isArray(items) || items.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    editor.cancelAutocomplete?.();
    const list = new SelectList(items, maxVisible, EDITOR_THEME.selectList, {
      minPrimaryColumnWidth: 18,
      maxPrimaryColumnWidth: 32,
    });
    let settled = false;
    let removeInputListener = null;
    const finish = (item) => {
      if (settled) return;
      settled = true;
      removeInputListener?.();
      editor.autocompleteState = null;
      editor.autocompleteList = undefined;
      requestRender();
      resolve(item);
    };
    list.setSelectedIndex(selectedIndex);
    list.onSelect = (item) => finish(item);
    list.onCancel = () => finish(null);
    editor.autocompleteState = "force";
    editor.autocompleteList = list;
    removeInputListener = tui.addInputListener((data) => {
      list.handleInput(data);
      requestRender();
      return { consume: true };
    });
    requestRender();
  });
}
