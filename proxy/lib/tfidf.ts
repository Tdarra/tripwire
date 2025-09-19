// proxy/lib/tfidf.ts
import fs from "fs";

export type Vocab = Record<string, number>;

type SavedConfig = {
  vocabulary?: Vocab;
  ngram_range?: [number, number] | number[];
  max_features?: number | null;
  min_df?: number;
  lowercase?: boolean;
  stop_words?: string | null;
} | Vocab;

export class TfidfFeaturizer {
  private vocab: Vocab;
  private ngramMin: number;
  private ngramMax: number;
  private dim: number;

  private constructor(vocab: Vocab, ngramMin = 1, ngramMax = 2) {
    this.vocab = vocab;
    this.ngramMin = Math.max(1, ngramMin || 1);
    this.ngramMax = Math.max(this.ngramMin, ngramMax || this.ngramMin);

    // Determine dimension as 1 + max index (scikit uses 0-based indices)
    let maxIdx = -1;
    for (const idx of Object.values(this.vocab)) {
      if (typeof idx === "number" && idx > maxIdx) maxIdx = idx;
    }
    this.dim = maxIdx + 1;
    if (!Number.isFinite(this.dim) || this.dim <= 0) {
      throw new Error(
        "[tfidf] Invalid vocabulary indices; computed dimension <= 0"
      );
    }
  }

  static fromFile(path: string): TfidfFeaturizer {
    if (!fs.existsSync(path)) {
      throw new Error(`[tfidf] File not found: ${path}`);
    }
    let raw: string;
    try {
      raw = fs.readFileSync(path, "utf-8");
    } catch (e: any) {
      throw new Error(`[tfidf] Failed reading ${path}: ${e?.message || e}`);
    }

    let parsed: SavedConfig;
    try {
      parsed = JSON.parse(raw);
    } catch (e: any) {
      throw new Error(`[tfidf] Invalid JSON in ${path}: ${e?.message || e}`);
    }

    // Accept either { vocabulary: {...}, ngram_range: [a,b], ... } OR flat {token:index}
    let vocab: Vocab | undefined;
    let ngramMin = 1;
    let ngramMax = 2;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // If it has 'vocabulary' key and it's a map, use it
      if (
        (parsed as any).vocabulary &&
        typeof (parsed as any).vocabulary === "object"
      ) {
        vocab = (parsed as any).vocabulary as Vocab;

        const nr = (parsed as any).ngram_range;
        if (Array.isArray(nr) && nr.length >= 1) {
          ngramMin = Math.max(1, Number(nr[0]) || 1);
          ngramMax = Math.max(ngramMin, Number(nr[1] ?? ngramMin) || ngramMin);
        }
      } else {
        // Otherwise, it might already be a flat vocab map
        // Heuristic: require at least one string->number entry
        const entries = Object.entries(parsed as Record<string, unknown>);
        const looksLikeVocab = entries.some(
          ([k, v]) => typeof k === "string" && typeof v === "number"
        );
        if (looksLikeVocab) {
          vocab = parsed as Vocab;
        }
      }
    }

    if (!vocab || Object.keys(vocab).length === 0) {
      throw new Error(
        "[tfidf] No usable vocabulary found. Expected either { vocabulary: {...} } or a flat { token: index } map."
      );
    }

    const feat = new TfidfFeaturizer(vocab, ngramMin, ngramMax);
    // Light debug for deploy logs
    console.log(
      `[tfidf] Loaded vocabulary: size=${Object.keys(vocab).length}, dim=${feat.dim}, ngram_range=[${feat.ngramMin},${feat.ngramMax}]`
    );
    return feat;
  }

  /** Tokenize roughly like scikit-learn default: keep words with 2+ alnum chars. */
  private tokenize(text: string): string[] {
    const lower = text.toLowerCase();
    const toks = lower.match(/\b[0-9a-zA-Z_’'’-]{2,}\b/g) || [];
    return toks;
  }

  /** Build ngrams from tokens according to configured ngram range. */
  private makeNgrams(tokens: string[]): string[] {
    if (this.ngramMin === 1 && this.ngramMax === 1) return tokens;
    const grams: string[] = [];
    const nMin = this.ngramMin;
    const nMax = this.ngramMax;
    for (let n = nMin; n <= nMax; n++) {
      if (n === 1) {
        grams.push(...tokens);
        continue;
      }
      for (let i = 0; i + n <= tokens.length; i++) {
        grams.push(tokens.slice(i, i + n).join(" "));
      }
    }
    return grams;
  }

  /** Transform a single text into a dense Float32Array bag/TF vector (no IDF). */
  transformOne(text: string): Float32Array {
    const vec = new Float32Array(this.dim); // zeros
    if (!text) return vec;

    const tokens = this.makeNgrams(this.tokenize(text));
    for (const t of tokens) {
      const idx = this.vocab[t];
      if (typeof idx === "number" && idx >= 0 && idx < this.dim) {
        vec[idx] += 1; // TF count (IDF was absorbed into XGBoost during training)
      }
    }
    return vec;
  }

  getDimension(): number {
    return this.dim;
  }
}
