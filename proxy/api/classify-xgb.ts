import fs from "fs";
import path from "path";
import * as ort from "onnxruntime-web";
import { TfidfFeaturizer } from "../lib/tfidf.js";

// Configure WASM runtime (loads wasm from CDN at runtime)
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";
ort.env.wasm.numThreads = 1; // safer for serverless
ort.env.wasm.simd = true;

type ClassifyBody = { message?: string };

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

    // Read ONNX as Uint8Array and create a WASM session
    const modelBytes = fs.readFileSync(ONNX_PATH);
    sessionPromise = ort.InferenceSession.create(modelBytes, {
      executionProviders: ["wasm"]
    });
  }
  const session = await sessionPromise;
  return { session, featurizer: featurizer! };
}

// Avoid importing '@vercel/node' to keep deps minimal; type as 'any'
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session, featurizer } = await init();

    const body: ClassifyBody = req.body || {};
    const message = (body.message || "").toString().trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // TF-IDF -> tensor [1, n_features]
    const vec = featurizer.transformOne(message);
    const inputName = session.inputNames[0];  // read actual input name
    const feeds: Record<string, ort.Tensor> = {};
    feeds[inputName] = new ort.Tensor("float32", vec, [1, vec.length]);

    const outputs = await session.run(feeds);
    const outName = session.outputNames[0];
    const out = outputs[outName];

    // ONNX classifier probs usually shape [1,2]: [P(SAFE), P(SCAM)]
    const probs = Array.from(out.data as Float32Array);
    const probaScam = (probs.length >= 2) ? Number(probs[1]) : Number(probs[0] ?? 0.0);

    const label = probaScam >= 0.5 ? "SCAM" : "SAFE";
    return res.status(200).json({
      label,
      raw: JSON.stringify({ proba_scam: probaScam.toFixed(6) })
    });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
