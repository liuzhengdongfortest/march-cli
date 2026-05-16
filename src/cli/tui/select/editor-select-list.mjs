import { SelectList, fuzzyFilter, matchesKey } from "@earendil-works/pi-tui";
import { EDITOR_THEME } from "../ui-theme.mjs";

export function showEditorSelectList({
  tui,
  editor,
  items,
  selectedIndex = 0,
  maxVisible = 8,
  requestRender,
  suppressInitialLineFeed = false,
  suppressInitialConfirm = false,
  searchable = false,
  getSearchText = defaultSearchText,
}) {
  if (!Array.isArray(items) || items.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    editor.cancelAutocomplete?.();
    const list = new SelectList(items, maxVisible, EDITOR_THEME.selectList, {
      minPrimaryColumnWidth: 18,
      maxPrimaryColumnWidth: 32,
    });
    let settled = false;
    let removeInputListener = null;
    let query = "";
    const finish = (item) => {
      if (settled) return;
      settled = true;
      removeInputListener?.();
      if (searchable) setEditorText(editor, "");
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
    let isFirstInput = true;
    removeInputListener = tui.addInputListener((data) => {
      if (isFirstInput && (suppressInitialConfirm || suppressInitialLineFeed) && isConfirmInput(data)) {
        isFirstInput = false;
        requestRender();
        return { consume: true };
      }
      isFirstInput = false;
      if (searchable && handleSearchInput(data)) {
        requestRender();
        return { consume: true };
      }
      list.handleInput(data);
      requestRender();
      return { consume: true };
    });
    requestRender();

    function handleSearchInput(data) {
      if (isBackspace(data)) {
        if (query.length === 0) return true;
        query = query.slice(0, -1);
        applySearch();
        return true;
      }
      const printable = decodeSinglePrintable(data);
      if (printable === undefined) return false;
      query += printable;
      applySearch();
      return true;
    }

    function applySearch() {
      setEditorText(editor, query);
      list.filteredItems = fuzzyFilter(items, query, getSearchText);
      list.setSelectedIndex(query ? 0 : selectedIndex);
    }
  });
}

function defaultSearchText(item) {
  return `${item?.label ?? ""} ${item?.description ?? ""} ${item?.value ?? ""}`;
}

function isBackspace(data) {
  return data === "\x7f" || data === "\b" || matchesKey(data, "backspace");
}

function isConfirmInput(data) {
  return data === "\r" || data === "\n" || matchesKey(data, "enter") || matchesKey(data, "return");
}

function decodeSinglePrintable(data) {
  if (typeof data !== "string" || data.length !== 1) return undefined;
  const code = data.charCodeAt(0);
  if (code < 32 || code === 127) return undefined;
  return data;
}

function setEditorText(editor, text) {
  if (typeof editor.setTextInternal === "function") {
    editor.setTextInternal(text);
    return;
  }
  if (editor.state) {
    editor.state.lines = [text];
    editor.state.cursorLine = 0;
    editor.state.cursorCol = text.length;
  }
  editor.onChange?.(text);
}
