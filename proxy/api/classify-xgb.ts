// proxy/api/classify-xgb.ts
import path from "node:path";
import fs from "node:fs";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as ort from "onnxruntime-node";
import { TfidfFeaturizer } from "../lib/tfidf.js";

type ClassifyBody = { message?: string };

// Load model & featurizer at cold start
const MODELS_DIR = path.join(process.cwd(), "models");
const TFIDF_PATH = path.join(MODELS_DIR, "tfidf_vocab.json");
const ONNX_PATH = path.join(MODELS_DIR, "xgb.onnx");

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let featurizer: TfidfFeaturizer | null = null;

async function init() {
  if (!sessionPromise) {
    if (!fs.existsSync(TFIDF_PATH) || !fs.existsSync(ONNX_PATH)) {
      throw new Error("Model files missing: tfidf_vocab.json or xgb.onnx");
    }
    featurizer = TfidfFeaturizer.fromFile(TFIDF_PATH);
    sessionPromise = ort.InferenceSession.create(ONNX_PATH, {
      executionProviders: ["cpuExecutionProvider"],
    });
  }
  return { session: await sessionPromise, featurizer: featurizer! };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session, featurizer } = await init();

    const body = (req.body || {}) as ClassifyBody;
    const message = (body.message || "").toString().trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // TF-IDF -> ONNX tensor [1, n_features]
    const vec = featurizer.transformOne(message);
    const input = new ort.Tensor("float32", vec, [1, vec.length]);

    // Run model
    const out = await session.run({ input }); // input name should match ONNX graph's first input name
    // Try common output names
    const first = out[Object.keys(out)[0]];
    // XGB classifier via skl2onnx usually returns probabilities as [1, 2] array
    const probs = first.data as Float32Array | number[];
    const probaScam = Number(Array.isArray(probs) ? probs[1] : probs[1]); // index 1 = positive class

    const label = probaScam >= 0.5 ? "SCAM" : "SAFE";
    return res.status(200).json({
      label,
      raw: JSON.stringify({ proba_scam: probaScam }),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
