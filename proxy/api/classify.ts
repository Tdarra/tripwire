import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_NAME = "gemini-1.5-flash";
export const config = { runtime: "nodejs" };


function parseLabel(text: string) {
  const t = (text || "").trim().toUpperCase();
  if (t.startsWith("SCAM")) return "SCAM";
  if (t.startsWith("SAFE")) return "SAFE";
  return "UNCERTAIN";
}

function buildPrompt(msg: string) {
  const sanitized = msg.trim().replace(/\s+/g, " ");
  return `
You are a strict binary classifier for consumer scam detection.

Rules (examples of likely SCAM):
- Unsolicited money requests, gift cards, crypto, urgent payment or account lock warnings.
- Claims of prizes, refunds, tax rebates requiring action or links.
- Impersonation of banks, delivery, government, merchants; suspicious shortened links.
- Poor grammar + pressure tactics.

Output contract:
- Return exactly one word: SCAM or SAFE.
- No punctuation, no quotes, no explanations.

Classify the following message:
"${sanitized}"
  `.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Client-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server misconfigured (missing GEMINI_API_KEY)" });

  const { message } = req.body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Missing 'message' string in body" });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ],
      generationConfig: {
        temperature: 0.0,
        topK: 1,
        topP: 0.0,
        maxOutputTokens: 16
      }
    });

    const prompt = buildPrompt(message);
    const result = await model.generateContent(prompt);
    const text = (result.response.text() || "").trim();
    const label = parseLabel(text);

    return res.status(200).json({ label, raw: text });
  } catch (e: any) {
    return res.status(502).json({ error: "Upstream error", detail: String(e?.message || e) });
  }
}
