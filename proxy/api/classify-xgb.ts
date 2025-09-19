// Calls a Vertex AI Endpoint for "classic" XGBoost predictions.
// Does NOT change request/response contract.
// Requires env vars: GCP_PROJECT_ID, VERTEX_LOCATION, VERTEX_ENDPOINT_ID, GCP_SA_KEY
export const config = { runtime: "nodejs" };

import path from "path";
import fs from "fs";
import { TfidfFeaturizer } from "../lib/tfidf.js";
import { GoogleAuth } from "google-auth-library";

type Body = { message?: string };

// Load TF-IDF vocab produced by training (commit to repo at proxy/models/tfidf_vocab.json)
const MODELS_DIR = path.join(process.cwd(), "models");
const TFIDF_PATH = path.join(MODELS_DIR, "tfidf_vocab.json");

let featurizer: TfidfFeaturizer | null = null;

function ensureFeaturizer(): TfidfFeaturizer {
  if (!featurizer) {
    if (!fs.existsSync(TFIDF_PATH)) {
      throw new Error("TF-IDF vocabulary not found at models/tfidf_vocab.json");
    }
    featurizer = TfidfFeaturizer.fromFile(TFIDF_PATH);
  }
  return featurizer!;
}

function getEndpointURL(): string {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_LOCATION;     // e.g., "us-central1"
  const endpointId = process.env.VERTEX_ENDPOINT_ID; // UUID
  if (!project || !location || !endpointId) {
    throw new Error("Missing GCP_PROJECT_ID, VERTEX_LOCATION, or VERTEX_ENDPOINT_ID");
  }
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/${endpointId}:predict`;
}

async function getAccessToken(): Promise<string> {
  const key = process.env.GCP_SA_KEY;
  if (!key) throw new Error("Missing GCP_SA_KEY");
  // GCP_SA_KEY should be the full JSON string of the service account key
  const credentials = JSON.parse(key);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) throw new Error("Failed to obtain access token");
  return token as string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: Body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = (body.message || "").toString().trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // 1) TF-IDF feature vector (same pipeline as training)
    const fzr = ensureFeaturizer();
    const vec = fzr.transformOne(message); // number[] | Float32Array
    const instance: number[] = Array.from(vec); // Vertex expects numbers

    // 2) Build request to Vertex Endpoint
    const url = getEndpointURL();
    const accessToken = await getAccessToken();

    const predictBody = JSON.stringify({ instances: [instance] });
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: predictBody,
    });

    const rawText = await resp.text();
    if (!resp.ok) {
      console.error("[classify-xgb] Vertex error", resp.status, rawText.slice(0, 1000));
      return res.status(502).json({ error: "Vertex upstream error", status: resp.status, detail: rawText.slice(0, 2000) });
    }

    // 3) Parse predictions
    // Prebuilt XGBoost usually returns probabilities as floats.
    // Some configs return arrays/objects; handle common shapes defensively.
    const parsed = JSON.parse(rawText);
    const preds = parsed?.predictions;

    let score: number | null = null;
    if (Array.isArray(preds) && preds.length > 0) {
      const first = preds[0];
      if (Array.isArray(first)) score = Number(first[0]);
      else if (typeof first === "object" && first !== null && "score" in first) score = Number(first.score);
      else if (typeof first === "number") score = Number(first);
    }

    if (typeof score !== "number" || Number.isNaN(score)) {
      console.warn("[classify-xgb] Unable to parse predictions; raw:", parsed);
      return res.status(500).json({ error: "Invalid prediction payload from Vertex" });
    }

    // 4) Map to SAFE/SCAM exactly like before
    const label = score >= 0.5 ? "SCAM" : "SAFE";
    return res.status(200).json({
      label,
      raw: JSON.stringify({ proba_scam: score.toFixed(6) })
    });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
