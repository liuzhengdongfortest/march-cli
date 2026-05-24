const MAX_INPUT_CHARS_PER_WORD = 100;

export class WordPieceTokenizer {
  constructor(tokenizerJson) {
    const model = tokenizerJson?.model ?? {};
    this.vocab = model.vocab ?? {};
    this.unkToken = model.unk_token ?? "[UNK]";
    this.unkId = this.vocab[this.unkToken] ?? 1;
    this.prefix = model.continuing_subword_prefix ?? "##";
    this.lowercase = tokenizerJson?.normalizer?.lowercase !== false;
    this.maxInputCharsPerWord = model.max_input_chars_per_word ?? MAX_INPUT_CHARS_PER_WORD;
  }

  encode(text, { maxLength = 512 } = {}) {
    const ids = [];
    for (const token of preTokenize(normalizeText(text, { lowercase: this.lowercase }))) {
      for (const id of this.wordPiece(token)) {
        if (id !== this.unkId) ids.push(id);
        if (ids.length >= maxLength) return ids;
      }
    }
    return ids;
  }

  wordPiece(token) {
    if (!token) return [];
    if (token.length > this.maxInputCharsPerWord) return [this.unkId];
    const ids = [];
    let start = 0;
    while (start < token.length) {
      let end = token.length;
      let current = null;
      while (start < end) {
        const piece = start === 0 ? token.slice(start, end) : `${this.prefix}${token.slice(start, end)}`;
        if (Object.hasOwn(this.vocab, piece)) {
          current = piece;
          break;
        }
        end -= 1;
      }
      if (current === null) return [this.unkId];
      ids.push(this.vocab[current]);
      start = end;
    }
    return ids;
  }
}

function normalizeText(text, { lowercase }) {
  let normalized = String(text ?? "").replace(/[\t\n\r]+/g, " ");
  normalized = normalized.replace(/[\u0000-\u001f\u007f]/g, " ");
  return lowercase ? normalized.toLowerCase() : normalized;
}

function preTokenize(text) {
  const tokens = [];
  let current = "";
  for (const char of text) {
    if (/\s/u.test(char)) {
      pushCurrent();
    } else if (isPunctuation(char)) {
      pushCurrent();
      tokens.push(char);
    } else {
      current += char;
    }
  }
  pushCurrent();
  return tokens;

  function pushCurrent() {
    if (current) tokens.push(current);
    current = "";
  }
}

function isPunctuation(char) {
  const code = char.codePointAt(0);
  if ((code >= 33 && code <= 47) || (code >= 58 && code <= 64)) return true;
  if ((code >= 91 && code <= 96) || (code >= 123 && code <= 126)) return true;
  return /\p{P}/u.test(char);
}
