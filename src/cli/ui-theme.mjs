export const EDITOR_THEME = {
  borderColor: (str) => `\x1b[90m${str}\x1b[0m`,
  selectList: {
    selectedPrefix: (text) => `\x1b[36m${text}\x1b[0m`,
    selectedText: (text) => `\x1b[37m${text}\x1b[0m`,
    description: (text) => `\x1b[90m${text}\x1b[0m`,
    scrollInfo: (text) => `\x1b[90m${text}\x1b[0m`,
    noMatch: (text) => `\x1b[90m${text}\x1b[0m`,
  },
};
