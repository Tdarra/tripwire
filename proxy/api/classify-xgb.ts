// proxy/api/classify-xgb.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { VertexAI } from "@google-cloud/vertexai";
import path from "path";
import fs from "fs";
import { TfidfFeaturizer } from "../lib/tfidf";

// Lazy singletons
let featurizer: TfidfFeaturizer | null = null;
let featurizerPath: string | null = null;

// Read config from env
const {
  GCP_PROJECT_ID,
  GCP_LOCATION = "us-central1",
  VERTEX_ENDPOINT_ID,
  GOOGLE_APPLICATION_CREDENTIALS, // optional in Vercel if using Workload Identity/Federation
} = process.env;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function ensureFeaturizer() {
  if (featurizer) return featurizer;

  // Support mounting the JSON inside repo (via includeFiles) or at /var/task
  const candidatePaths = [
    path.join(process.cwd(), "models", "tfidf_vocab.json"),
    path.join(process.cwd(), "proxy", "models", "tfidf_vocab.json"),
    "/var/task/models/tfidf_vocab.json",
    "/var/task/proxy/models/tfidf_vocab.json",
  ];
  let found: string | null = null;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      found = p;
      break;
    }
  }
  if (!found) {
    throw new Error(
      "tfidf_vocab.json not found. Ensure it’s included in the Serverless Function (e.g., proxy/vercel.json -> includeFiles) or placed under proxy/models/"
    );
  }

  featurizerPath = found;
  featurizer = TfidfFeaturizer.fromFile(found);
  console.log(
    `[classify-xgb] Featurizer ready from ${found}, dim=${featurizer.getDimension()}`
  );
  return featurizer;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const message = (req.body?.message ?? "").toString();
    if (!message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const f = await ensureFeaturizer();
    const vec = Array.from(f.transformOne(message)); // dense Float32Array -> number[]
    console.log(
      `[classify-xgb] Vectorized text length=${vec.length} (first_nonzero_idx=${vec.findIndex(
        (v) => v > 0
      )})`
    );

    // Call Vertex AI endpoint (deployed custom prediction container)
    const project = requireEnv("GCP_PROJECT_ID");
    const location = GCP_LOCATION!;
    const endpointId = requireEnv("VERTEX_ENDPOINT_ID");

    const vertex = new VertexAI({ project, location });
    const preds = vertex.preview.predictionService(); // lightweight REST stub

    const endpointPath = `projects/${project}/locations/${location}/endpoints/${endpointId}`;
    const requestBody = {
      endpoint: endpointPath,
      instances: [{ features: vec }], // your custom container expects {features: [ ... ]}
    };

    const [response] = await (preds as any).predict(requestBody);
    // Expecting { predictions: [{ label: "SCAM"|"SAFE", proba_scam: number, raw?: any }] }
    const prediction = response?.predictions?.[0] ?? null;

    if (!prediction) {
      console.error("[classify-xgb] Empty prediction:", response);
      return res.status(502).json({ error: "empty prediction from Vertex" });
    }

    // Normalize shape
    const label = prediction.label ?? (prediction.proba_scam >= 0.5 ? "SCAM" : "SAFE");
    const proba_scam =
      typeof prediction.proba_scam === "number"
        ? prediction.proba_scam
        : Number(prediction.proba_scam ?? 0);

    return res.status(200).json({
      label,
      raw: JSON.stringify({ proba_scam }),
    });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}

