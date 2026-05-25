export class KeywordVectorizer {
  constructor(terms) {
    this.terms = terms.map((term) => term.toLowerCase());
    this.dimensions = this.terms.length;
    this.id = `keyword-${this.terms.join("-")}`;
  }

  async encode(texts) {
    return texts.map((text) => {
      const lower = String(text ?? "").toLowerCase();
      const values = new Float32Array(this.dimensions);
      for (let index = 0; index < this.terms.length; index += 1) {
        values[index] = lower.includes(this.terms[index]) ? 1 : 0;
      }
      const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
      return { values, norm };
    });
  }
}
