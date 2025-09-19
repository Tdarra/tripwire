// proxy/api/classify-xgb.ts
// Calls a Vertex AI Endpoint for "classic" XGBoost predictions.
// Requires env vars: GCP_PROJECT_ID, VERTEX_LOCATION, VERTEX_ENDPOINT_ID, GCP_SA_KEY
// GCP_SA_KEY should be the full JSON service account key string.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import path from "path";
import fs from "fs";
import { GoogleAuth } from "google-auth-library";
import { TfidfFeaturizer } from "../lib/tfidf";

type Body = { message?: string };

// --- Featurizer setup ---
const TFIDF_PATHS = [
  path.join(process.cwd(), "proxy", "models", "tfidf_vocab.json"),
  path.join(process.cwd(), "models", "tfidf_vocab.json"),
  "/var/task/proxy/models/tfidf_vocab.json",
  "/var/task/models/tfidf_vocab.json",
];
let featurizer: TfidfFeaturizer | null = null;

function ensureFeaturizer(): TfidfFeaturizer {
  if (featurizer) return featurizer;

  const found = TFIDF_PATHS.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "tfidf_vocab.json not found. Ensure it’s bundled (via proxy/vercel.json includeFiles) under proxy/models/"
    );
  }

  featurizer = TfidfFeaturizer.fromFile(found);
  console.log(`[classify-xgb] Featurizer loaded from ${found}`);
  return featurizer;
}

// --- Env helpers ---
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getEndpointURL(): string {
  const project = requireEnv("GCP_PROJECT_ID");
  const location = requireEnv("VERTEX_LOCATION");
  const endpointId = requireEnv("VERTEX_ENDPOINT_ID");
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/${endpointId}:predict`;
}

async function getAccessToken(): Promise<string> {
  const key = process.env.GCP_SA_KEY;
  if (!key) throw new Error("Missing GCP_SA_KEY");
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

// --- Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: Body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = (body.message || "").toString().trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // 1) Vectorize
    const fzr = ensureFeaturizer();
    const vec = Array.from(fzr.transformOne(message)); // Float32Array -> number[]
    console.log(`[classify-xgb] Vectorized message, dim=${vec.length}`);

    // 2) Build Vertex request
    const url = getEndpointURL();
    const accessToken = await getAccessToken();
    const predictBody = JSON.stringify({ instances: [{ features: vec }] });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: predictBody,
    });

    const rawText = await resp.text();
    if (!resp.ok) {
      console.error("[classify-xgb] Vertex error", resp.status, rawText.slice(0, 500));
      return res
        .status(502)
        .json({ error: "Vertex upstream error", status: resp.status, detail: rawText });
    }

    const parsed = JSON.parse(rawText);
    const prediction = parsed?.predictions?.[0];
    if (!prediction) {
      console.error("[classify-xgb] Empty prediction", parsed);
      return res.status(502).json({ error: "empty prediction from Vertex" });
    }

    // Expecting shape: { proba_scam: number }
    const proba = Number(prediction.proba_scam ?? prediction.score ?? 0);
    const label = proba >= 0.5 ? "SCAM" : "SAFE";

    return res.status(200).json({
      label,
      raw: JSON.stringify({ proba_scam: proba }),
    });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
