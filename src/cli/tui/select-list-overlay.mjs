import { SelectList } from "@mariozechner/pi-tui";
import { EDITOR_THEME } from "./ui-theme.mjs";

export function showSelectListOverlay({
  tui,
  items,
  selectedIndex = 0,
  maxVisible = 8,
  width = 64,
  requestRender,
  SelectListImpl = SelectList,
  theme = EDITOR_THEME.selectList,
} = {}) {
  if (!Array.isArray(items) || items.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const list = new SelectListImpl(items, maxVisible, theme, {
      minPrimaryColumnWidth: 18,
      maxPrimaryColumnWidth: 32,
    });
    let settled = false;
    let handle = null;
    const finish = (item) => {
      if (settled) return;
      settled = true;
      if (handle) handle.hide();
      requestRender();
      resolve(item);
    };
    list.setSelectedIndex(selectedIndex);
    list.onSelect = (item) => finish(item);
    list.onCancel = () => finish(null);
    handle = tui.showOverlay(list, {
      width,
      minWidth: 40,
      maxHeight: maxVisible + 1,
      anchor: "bottom-center",
      margin: 1,
    });
    requestRender();
  });
}
