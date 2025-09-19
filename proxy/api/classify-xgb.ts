// Calls a Vertex AI Endpoint (prebuilt XGBoost prediction container).
// Env: GCP_PROJECT_ID, VERTEX_LOCATION, VERTEX_ENDPOINT_ID,
//      and either GCP_SA_KEY_B64 (base64) or GCP_SA_KEY (raw JSON).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import path from "path";
import fs from "fs";
import { GoogleAuth } from "google-auth-library";
import { TfidfFeaturizer } from "../lib/tfidf.js";

type Body = { message?: string };

type ServiceAccountJSON = {
  type?: string;
  client_email?: string;
  project_id?: string;
  [key: string]: unknown;
};

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
      "tfidf_vocab.json not found. Ensure it’s bundled in the function (proxy/vercel.json includeFiles) under proxy/models/"
    );
  }
  featurizer = TfidfFeaturizer.fromFile(found);
  console.log(
    `[classify-xgb] Featurizer loaded from ${found}, dim=${featurizer.getDimension()}`
  );
  return featurizer;
}

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

function loadServiceAccountJSON(): ServiceAccountJSON {
  const b64 = process.env.GCP_SA_KEY_B64;
  if (b64 && b64.trim()) {
    const raw = Buffer.from(b64.trim(), "base64").toString("utf8");
    const parsed = JSON.parse(raw) as ServiceAccountJSON;
    console.log(
      `[classify-xgb] Service account JSON decoded from GCP_SA_KEY_B64 type=${String(
        parsed?.type ?? "unknown"
      )} project_id=${String(parsed?.project_id ?? "unknown")} client_email=${String(
        parsed?.client_email ?? "unknown"
      )}`
    );
    return parsed;
  }
  const raw = process.env.GCP_SA_KEY;
  if (!raw) throw new Error("Missing GCP_SA_KEY_B64 or GCP_SA_KEY");
  const parsed = JSON.parse(raw) as ServiceAccountJSON;
  console.log(
    `[classify-xgb] Service account JSON read from GCP_SA_KEY type=${String(
      parsed?.type ?? "unknown"
    )} project_id=${String(parsed?.project_id ?? "unknown")} client_email=${String(
      parsed?.client_email ?? "unknown"
    )}`
  );
  return parsed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body: Body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = (body.message || "").toString().trim();
    if (!message) return res.status(400).json({ error: "message is required" });

    // Vectorize with the same TF-IDF used in training
    const fzr = ensureFeaturizer();
    const vec = Array.from(fzr.transformOne(message)); // Float32Array -> number[]
    console.log(`[classify-xgb] Vectorized message, dim=${vec.length}`);

    // Prepare auth client (let it sign the request; do NOT manually parse or decode tokens)
    const credentials = loadServiceAccountJSON();
    const auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();

    // Call Vertex endpoint directly through the auth client
    const url = getEndpointURL();
    const { data, status } = await (client as any).request({
      url,
      method: "POST",
      data: { instances: [vec] }, // Prebuilt XGBoost expects 2-D numeric array
      headers: { "content-type": "application/json" },
    });

    if (status < 200 || status >= 300) {
      console.error("[classify-xgb] Vertex error status", status, JSON.stringify(data)?.slice(0, 800));
      return res.status(502).json({ error: "Vertex upstream error", status, detail: data });
    }

    // Prebuilt XGBoost commonly returns probabilities as numbers: { predictions: [0.73, ...] }
    const first = data?.predictions?.[0];
    let proba = 0;
    if (typeof first === "number") proba = first;
    else if (Array.isArray(first) && first.length) proba = Number(first[0]);
    else if (first && typeof first === "object" && "score" in first) proba = Number((first as any).score);

    const label = proba >= 0.5 ? "SCAM" : "SAFE";
    return res.status(200).json({ label, raw: JSON.stringify({ proba_scam: proba }) });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
