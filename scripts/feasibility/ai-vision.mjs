#!/usr/bin/env node
// S0 feasibility probe — one real vision API image request, schema-validated structured JSON.
// Usage:
//   node --env-file=.env.local scripts/feasibility/ai-vision.mjs --image tests/fixtures/ai/sample-device.png
// Requires an OpenAI-compatible chat-completions endpoint (AI_BASE_URL incl. version, e.g. https://api.openai.com/v1).
// Never prints the API key; prints endpoint host, model, latency and the validated JSON only.

import { readFileSync } from "node:fs";

const required = ["AI_API_KEY", "AI_MODEL"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. Set them in .env.local (gitignored, never committed).`);
  process.exit(1);
}

const args = process.argv.slice(2);
const imgIdx = args.indexOf("--image");
const imagePath = imgIdx >= 0 ? args[imgIdx + 1] : undefined;
if (!imagePath) {
  console.error("Usage: --image <path to png/jpeg/webp>");
  process.exit(1);
}

const base = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const endpoint = `${base}/chat/completions`;
const model = process.env.AI_MODEL;
const timeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30000);

let mime;
if (imagePath.endsWith(".png")) mime = "image/png";
else if (imagePath.endsWith(".jpg") || imagePath.endsWith(".jpeg")) mime = "image/jpeg";
else if (imagePath.endsWith(".webp")) mime = "image/webp";
else {
  console.error("Unsupported image extension (use png/jpg/jpeg/webp).");
  process.exit(1);
}

let dataUrl;
try {
  dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString("base64")}`;
} catch (err) {
  console.error(`Cannot read image: ${err.message}`);
  process.exit(1);
}

const systemPrompt = [
  "You are a visual triage assistant for electronics repair intake. You are not a repair technician.",
  "Describe only what is visually observable. Separate visible observations from hypotheses and unknowns.",
  "If the image is blurry, dark, obstructed, unrelated to a damaged device, or insufficient, set overallConfidence to UNASSESSED and explain why in limitations.",
  "Do not infer exact device model from the image when it is provided; surface any mismatch as a recommendedQuestion.",
  "Do not make authenticity claims, price claims, or repair-quality claims.",
  "Return ONLY a JSON object matching exactly this shape — no markdown, no extra keys:",
  `{`,
  `  "deviceModelAssessment": { "value": string, "source": "USER_SELECTED" | "AI_SUGGESTED" | "UNKNOWN", "needsConfirmation": boolean },`,
  `  "visibleObservations": [ { "observation": string, "evidence": string, "certainty": "HIGH" | "MEDIUM" | "LOW" } ],`,
  `  "suspectedCauses": [ { "cause": string, "certainty": "HIGH" | "MEDIUM" | "LOW", "basis": string } ],`,
  `  "likelyRepairCategory": string,`,
  `  "overallConfidence": "LOW" | "MEDIUM" | "HIGH" | "UNASSESSED",`,
  `  "unknowns": [string],`,
  `  "recommendedQuestions": [string],`,
  `  "limitations": [string]`,
  `}`,
].join("\n");

async function request(withResponseFormat) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: 'Device model selected by the customer: "Apple iPhone 13" (test image, S0 feasibility). Assess per instructions and return only the JSON object.' },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        ...(withResponseFormat ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });
    return { res, latencyMs: Date.now() - started };
  } catch (err) {
    return { error: err.name === "AbortError" ? `timeout after ${timeoutMs}ms` : err.message, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`endpoint host: ${new URL(endpoint).host} model: ${model} image: ${imagePath} (${mime})`);

let { res, latencyMs, error } = await request(true);
if (error) {
  console.error(`NETWORK_ERROR: ${error} — retrying once with same parameters`);
  ({ res, latencyMs, error } = await request(true));
  if (error) {
    console.error(`NETWORK_ERROR again: ${error}`);
    process.exit(2);
  }
}
if (res.status === 400) {
  const errText = await res.clone().text().catch(() => "");
  if (/response_format/i.test(errText)) {
    console.log("provider rejected response_format — retrying once without it");
    ({ res, latencyMs } = await request(false));
  }
}

console.log(`HTTP ${res.status} ${res.statusText} latency=${latencyMs}ms`);
if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error("ERROR (sanitized, truncated):", body.replace(/\s+/g, " ").slice(0, 600));
  process.exit(res.status === 401 || res.status === 403 ? 4 : 3);
}

const payload = await res.json();
const usage = payload.usage ?? {};
console.log(`usage: prompt=${usage.prompt_tokens ?? "?"} completion=${usage.completion_tokens ?? "?"} total=${usage.total_tokens ?? "?"}`);
const message = payload.choices?.[0]?.message ?? {};
// Reasoning-style models may split output between content and reasoning_content.
const content = [message.content, message.reasoning_content]
  .filter((c) => typeof c === "string" && c.trim())
  .map((c) => c.trim())
  .join("\n") || null;
if (typeof content !== "string" || !content.trim()) {
  console.error("EMPTY_CHOICE_CONTENT — finish_reason:", payload.choices?.[0]?.finish_reason);
  process.exit(5);
}

let parsed;
const candidates = [];
const message2 = payload.choices?.[0]?.message ?? {};
for (const c of [message2.content, message2.reasoning_content]) {
  if (typeof c === "string" && c.trim()) candidates.push(c.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
}
// Last resort: extract the outermost JSON object from mixed reasoning text.
candidates.push((() => {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  return start >= 0 && end > start ? content.slice(start, end + 1) : "";
})());
parsed = null;
for (const cand of candidates) {
  if (!cand) continue;
  try {
    parsed = JSON.parse(cand);
    break;
  } catch {
    // try next candidate
  }
}
if (!parsed) {
  console.error("INVALID_JSON output (first 400 chars):", content.slice(0, 400).replace(/\s+/g, " "));
  process.exit(5);
}

// Structural validation against the application diagnosis schema (S0 subset).
const problems = [];
const bands = ["LOW", "MEDIUM", "HIGH", "UNASSESSED"];
const band3 = ["HIGH", "MEDIUM", "LOW"];
if (!parsed.deviceModelAssessment || typeof parsed.deviceModelAssessment !== "object") problems.push("missing deviceModelAssessment");
else {
  if (typeof parsed.deviceModelAssessment.value !== "string") problems.push("deviceModelAssessment.value must be string");
  if (!["USER_SELECTED", "AI_SUGGESTED", "UNKNOWN"].includes(parsed.deviceModelAssessment.source)) problems.push("deviceModelAssessment.source invalid");
  if (typeof parsed.deviceModelAssessment.needsConfirmation !== "boolean") problems.push("deviceModelAssessment.needsConfirmation must be boolean");
}
if (!Array.isArray(parsed.visibleObservations)) problems.push("visibleObservations must be array");
else parsed.visibleObservations.forEach((o, i) => {
  if (typeof o?.observation !== "string") problems.push(`visibleObservations[${i}].observation must be string`);
  if (typeof o?.evidence !== "string") problems.push(`visibleObservations[${i}].evidence must be string`);
  if (!band3.includes(o?.certainty)) problems.push(`visibleObservations[${i}].certainty must be HIGH|MEDIUM|LOW`);
});
if (!Array.isArray(parsed.suspectedCauses)) problems.push("suspectedCauses must be array");
else parsed.suspectedCauses.forEach((c, i) => {
  if (typeof c?.cause !== "string") problems.push(`suspectedCauses[${i}].cause must be string`);
  if (!band3.includes(c?.certainty)) problems.push(`suspectedCauses[${i}].certainty must be HIGH|MEDIUM|LOW`);
  if (typeof c?.basis !== "string") problems.push(`suspectedCauses[${i}].basis must be string`);
});
if (typeof parsed.likelyRepairCategory !== "string") problems.push("likelyRepairCategory must be string");
if (!bands.includes(parsed.overallConfidence)) problems.push("overallConfidence must be LOW|MEDIUM|HIGH|UNASSESSED (no percentages)");
if (!Array.isArray(parsed.unknowns) || parsed.unknowns.some((u) => typeof u !== "string")) problems.push("unknowns must be string[]");
if (!Array.isArray(parsed.recommendedQuestions) || parsed.recommendedQuestions.some((u) => typeof u !== "string")) problems.push("recommendedQuestions must be string[]");
if (!Array.isArray(parsed.limitations) || parsed.limitations.some((u) => typeof u !== "string")) problems.push("limitations must be string[]");
const unexpected = Object.keys(parsed).filter((k) => !["deviceModelAssessment", "visibleObservations", "suspectedCauses", "likelyRepairCategory", "overallConfidence", "unknowns", "recommendedQuestions", "limitations"].includes(k));
if (unexpected.length) problems.push(`unexpected extra keys: ${unexpected.join(", ")}`);

if (problems.length) {
  console.error("SCHEMA_INVALID:", problems.join("; "));
  process.exit(6);
}

console.log("SCHEMA_VALID");
console.log(JSON.stringify(parsed, null, 2));
