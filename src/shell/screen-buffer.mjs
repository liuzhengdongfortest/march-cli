import headless from "@xterm/headless";

const { Terminal } = headless;

export function createTerminalScreenBuffer({ cols = 80, rows = 24 } = {}) {
  const terminal = new Terminal({
    allowProposedApi: true,
    cols: normalizePositiveInt(cols, 80),
    rows: normalizePositiveInt(rows, 24),
    scrollback: 0,
  });

  let pendingWrites = 0;

  return {
    write(data) {
      pendingWrites += 1;
      terminal.write(String(data ?? ""), () => {
        pendingWrites = Math.max(0, pendingWrites - 1);
      });
    },
    resize(nextCols, nextRows) {
      terminal.resize(
        normalizePositiveInt(nextCols, terminal.cols),
        normalizePositiveInt(nextRows, terminal.rows),
      );
    },
    snapshot() {
      const lines = readViewportLines(terminal);
      return {
        cols: terminal.cols,
        rows: terminal.rows,
        pendingWrites,
        plain: lines.map((line) => line.plain).join("\n"),
        ansi: lines.map((line) => line.ansi).join("\n"),
      };
    },
    dispose() {
      terminal.dispose();
    },
  };
}

function readViewportLines(terminal) {
  const buffer = terminal.buffer.active;
  const start = buffer.baseY;
  const rows = [];
  for (let y = start; y < start + terminal.rows; y++) {
    const line = buffer.getLine(y);
    rows.push(line ? lineToSnapshot(line) : { plain: "", ansi: "" });
  }
  return trimTrailingBlankRows(rows);
}

function lineToSnapshot(line) {
  const end = findContentEnd(line);
  if (end === 0) return { plain: "", ansi: "" };

  const plain = line.translateToString(false, 0, end);
  let ansi = "";
  let activeStyle = "";
  for (let x = 0; x < end; x++) {
    const cell = line.getCell(x);
    if (!cell || cell.getWidth() === 0) continue;
    const chars = cell.getChars() || " ";
    const style = cellToSgr(cell);
    if (style !== activeStyle) {
      if (activeStyle) ansi += "\x1b[0m";
      if (style) ansi += style;
      activeStyle = style;
    }
    ansi += chars;
  }
  if (activeStyle) ansi += "\x1b[0m";
  return { plain, ansi };
}

function findContentEnd(line) {
  for (let x = line.length - 1; x >= 0; x--) {
    const cell = line.getCell(x);
    if (cell?.getChars()) return x + cell.getWidth();
  }
  return 0;
}

function cellToSgr(cell) {
  if (cell.isAttributeDefault()) return "";
  const codes = [];
  if (cell.isBold()) codes.push(1);
  if (cell.isDim()) codes.push(2);
  if (cell.isItalic()) codes.push(3);
  if (cell.isUnderline()) codes.push(4);
  if (cell.isBlink()) codes.push(5);
  if (cell.isInverse()) codes.push(7);
  if (cell.isInvisible()) codes.push(8);
  if (cell.isStrikethrough()) codes.push(9);
  if (cell.isOverline()) codes.push(53);
  pushColorCodes(codes, cell, "fg");
  pushColorCodes(codes, cell, "bg");
  return codes.length ? `\x1b[${codes.join(";")}m` : "";
}

function pushColorCodes(codes, cell, target) {
  const isFg = target === "fg";
  const isDefault = isFg ? cell.isFgDefault() : cell.isBgDefault();
  if (isDefault) return;

  const color = isFg ? cell.getFgColor() : cell.getBgColor();
  const base = isFg ? 30 : 40;
  const brightBase = isFg ? 90 : 100;
  if (isFg ? cell.isFgRGB() : cell.isBgRGB()) {
    codes.push(isFg ? 38 : 48, 2, (color >> 16) & 255, (color >> 8) & 255, color & 255);
    return;
  }
  if (isFg ? cell.isFgPalette() : cell.isBgPalette()) {
    if (color < 8) {
      codes.push(base + color);
    } else if (color < 16) {
      codes.push(brightBase + color - 8);
    } else {
      codes.push(isFg ? 38 : 48, 5, color);
    }
  }
}

function trimTrailingBlankRows(rows) {
  let end = rows.length;
  while (end > 0 && rows[end - 1].plain === "") end -= 1;
  return rows.slice(0, end);
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return Math.max(1, Math.trunc(Number(fallback) || 1));
  return Math.max(1, Math.trunc(number));
}
