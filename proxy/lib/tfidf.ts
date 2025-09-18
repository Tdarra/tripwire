// proxy/lib/tfidf.ts
import fs from "fs";
import path from "path";

type Vocab = Record<string, number>;
type TFIDFConfig = { vocab: Vocab; idf: number[]; ngram_range: [number, number] };

export class TfidfFeaturizer {
  private vocab: Vocab;
  private idf: Float32Array;
  private ngramMin: number;
  private ngramMax: number;

  constructor(cfg: TFIDFConfig) {
    this.vocab = cfg.vocab;
    this.idf = new Float32Array(cfg.idf);
    this.ngramMin = cfg.ngram_range?.[0] ?? 1;
    this.ngramMax = cfg.ngram_range?.[1] ?? 1;
  }

  static fromFile(p: string) {
    const raw = fs.readFileSync(p, "utf8");
    const cfg = JSON.parse(raw) as TFIDFConfig;
    return new TfidfFeaturizer(cfg);
  }

  /** naive tokenization: lowercase + split on non-letters/numbers */
  private tokenize(text: string): string[] {
    return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  }

  private ngrams(tokens: string[]): string[] {
    const grams: string[] = [];
    for (let n = this.ngramMin; n <= this.ngramMax; n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        grams.push(tokens.slice(i, i + n).join(" "));
      }
    }
    return grams;
  }

  /** Returns Float32Array with length = vocab size (order by index) */
  transformOne(text: string): Float32Array {
    const tokens = this.tokenize(text);
    const grams = this.ngrams(tokens);

    const counts = new Map<number, number>();
    for (const g of grams) {
      const idx = this.vocab[g];
      if (idx !== undefined) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }

    const vec = new Float32Array(this.idf.length);
    const normDen: number[] = [];
    for (const [idx, tf] of counts.entries()) {
      // simple l2 normalization TF
      vec[idx] = tf; // raw term frequency
      normDen.push(tf * tf);
    }
    let l2 = Math.sqrt(normDen.reduce((a, b) => a + b, 0)) || 1.0;

    // TF-IDF = (tf / l2) * idf
    for (const [idx] of counts.entries()) {
      vec[idx] = (vec[idx] / l2) * this.idf[idx];
    }
    return vec;
  }
}
