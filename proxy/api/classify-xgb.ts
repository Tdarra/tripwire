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
  console.log(`[classify-xgb] Featurizer loaded from ${found}, dim=${featurizer.getDimension()}`);
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

function describeTokenShape(token: unknown): string {
  const type = typeof token;
  const keys = token && typeof token === "object" ? Object.keys(token as Record<string, unknown>) : [];
  return keys.length ? `type=${type} keys=${keys.join(",")}` : `type=${type}`;
}

async function getAccessToken(): Promise<string> {
  const credentials = loadServiceAccountJSON();
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()) as unknown;
  if (!token) {
    throw new Error(`[classify-xgb] Failed to obtain access token: ${describeTokenShape(token)}`);
  }

  let stringToken: string | null = null;
  let tokenSource = "unknown";
  if (typeof token === "string") {
    stringToken = token.trim();
    tokenSource = "string";
  } else if (token && typeof token === "object") {
    const tokenObj = token as Record<string, unknown>;
    const candidateKeys = ["token", "access_token"] as const;
    for (const key of candidateKeys) {
      const value = tokenObj[key];
      if (typeof value === "string" && value.trim()) {
        stringToken = value.trim();
        tokenSource = `object.${key}`;
        break;
      }
    }
  }

  if (!stringToken) {
    throw new Error(
      `[classify-xgb] Unexpected access token payload: ${describeTokenShape(token)}`
    );
  }

  const payload = decodeJWTPayload(stringToken);
  const exp = typeof payload?.exp === "number" ? new Date(payload.exp * 1000).toISOString() : "unknown";
  console.log(
    `[classify-xgb] Access token minted source=${tokenSource} length=${stringToken.length} exp=${exp}`
  );
  if (payload) {
    const iss = typeof payload.iss === "string" ? payload.iss : "unknown";
    const sub = typeof payload.sub === "string" ? payload.sub : "unknown";
    const aud = payload.aud ? JSON.stringify(payload.aud) : "unknown";
    console.log(`[classify-xgb] Access token payload iss=${iss} sub=${sub} aud=${aud}`);
  }
  return stringToken;
}

type JWTPayload = {
  exp?: number;
  iss?: string;
  sub?: string;
  aud?: unknown;
  [key: string]: unknown;
};

function decodeJWTPayload(token: string): JWTPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadSegment = parts[1];
  const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as JWTPayload;
  } catch (err) {
    console.warn("[classify-xgb] Failed to decode JWT payload", err);
    return null;
  }
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

    // Prebuilt XGBoost expects 2-D numeric array: { "instances": [[...]] }
    const url = getEndpointURL();
    const accessToken = await getAccessToken();
    const predictBody = JSON.stringify({ instances: [vec] });

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
      console.error("[classify-xgb] Vertex error", resp.status, rawText.slice(0, 800));
      return res
        .status(502)
        .json({ error: "Vertex upstream error", status: resp.status, detail: rawText });
    }

    const parsed = JSON.parse(rawText);
    // Prebuilt XGBoost commonly returns probabilities as numbers: { predictions: [0.73, ...] }
    const first = parsed?.predictions?.[0];
    let proba = 0;
    if (typeof first === "number") proba = first;
    else if (Array.isArray(first) && first.length) proba = Number(first[0]);
    else if (first && typeof first === "object" && "score" in first) proba = Number(first.score);

    const label = proba >= 0.5 ? "SCAM" : "SAFE";
    return res.status(200).json({ label, raw: JSON.stringify({ proba_scam: proba }) });
  } catch (e: any) {
    console.error("[classify-xgb] ERROR", e);
    return res.status(500).json({ error: e?.message || "internal error" });
  }
}
