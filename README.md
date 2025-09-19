# TripWire

TripWire is an Android + serverless proxy application that classifies text messages as **SAFE** or **SCAM**.  
It supports two classification backends:

1. **Gemini GenAI** (default) — uses Google’s generative AI models for classification.
2. **Classic ML (XGBoost)** — uses a TF-IDF + XGBoost model trained on spam/scam datasets and deployed via **Google Cloud Vertex AI**.

UI checkbox lets user pick backend which labels responses as **SAFE** or **SCAM**:
- Unchecked → /api/classify (Gemini). 
- Checked → /api/classify-xgb (Vertex).

---

## Architecture

Android App → Vercel Proxy → (Gemini API or Vertex AI XGBoost)

- **Android client** sends SMS text to the `/api/classify` endpoint.
- **Proxy (Vercel)** provides two handlers:
    - `/api/classify` → calls **Gemini API**.
    - `/api/classify-xgb` → calls **Vertex AI endpoint** with a TF-IDF feature vector.
- **UI toggle** in the app lets users choose between **GenAI** (Gemini) and **Classic** (XGBoost).

---

## Backends

### 1. Gemini GenAI
- Relies on `@google/generative-ai` SDK.
- Request is forwarded from the Android app to the Vercel proxy.
- Proxy sends the SMS to Gemini with a prompt asking for **SAFE** or **SCAM** classification.
- Response is parsed and returned to the client.

Env vars required in Vercel: 

- GEMINI_API_KEY=your_api_key

### 2. Vertex AI XGBoost
- Dataset: `spam_converted.csv` (text + string labels).
- Training:
    - Local dev pipeline builds a **TF-IDF vocabulary** + trains an XGBoost model.
    - Artifacts (`model.bst`, `tfidf_vocab.json`, `metadata.json`) uploaded to GCS.
    - Vertex AI Custom Job trains/evaluates, then saves the model.
    - Model is **deployed as an Endpoint** in Vertex AI.
- Inference:
    - Proxy uses the same TF-IDF vocabulary to transform text into features.
    - Sends `{"instances": [[f1, f2, ..., fn]]}` payload to the Vertex endpoint.
    - Reads predicted probability → maps to `SAFE` / `SCAM`.

Env vars required in Vercel:

- GCP_PROJECT_ID=tripwire-xgb
- VERTEX_LOCATION=us-central1
- VERTEX_ENDPOINT_ID=your_endpoint_id
- GCP_SA_KEY=your raw JSON of service account with Vertex + Storage roles (i.e.Vertex AI User)

## Experiemental Analysis of Gemini Flash 1.5
https://colab.research.google.com/gist/Tdarra/f5f5bd76e14a128926bede755de6b51d/tripwire_exp.ipynb

