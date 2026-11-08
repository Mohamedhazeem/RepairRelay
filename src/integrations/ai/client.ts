/**
 * OpenAI-compatible chat-completions client for vision diagnosis (S01-owned adapter).
 * Learnings from the S0 probe (V-006): reasoning-style models may split output between
 * `content` and `reasoning_content`; JSON may arrive fenced or embedded — extract the
 * outermost object. Response-format support varies; retry once without it on 400.
 * Provider timeouts map to UNKNOWN outcomes, never to fabricated results.
 */

import { getServerEnv } from "@/lib/env";

export type ImageInput = { mimeType: string; base64: string };

export type ChatResult =
  | { ok: true; content: string | null; reasoningContent: string | null; text: string; model: string; latencyMs: number; usage: { prompt: number; completion: number } | null }
  | { ok: false; error: "TIMEOUT" | "NETWORK" | "HTTP" | "EMPTY"; status?: number; detail?: string };

type FetchLike = typeof fetch;

export function systemPromptForDiagnosis(): string {
  return [
    "You are a visual triage assistant for electronics repair intake. You are not a repair technician.",
    "Describe only what is visually observable in the provided image(s). Separate visible observations from hypotheses and unknowns.",
    "If the image is blurry, dark, obstructed, unrelated to a damaged device, or insufficient, set overallConfidence to UNASSESSED and explain why in limitations. Never invent a device or a fault.",
    "Do not infer the exact device model from the image; the customer selected it. Surface any mismatch as a recommendedQuestion.",
    "Do not make authenticity claims, price claims, repair-quality claims, or compatibility claims.",
    "Return ONLY one JSON object matching exactly this shape — no markdown, no extra keys:",
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
}

/** Extract the first balanced JSON object from a string (string/escape aware). */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Robust JSON extraction: content first, then reasoning_content; handles fences and trailing commentary. */
export function extractJsonObject(message: { content?: unknown; reasoning_content?: unknown }): unknown | null {
  const candidates: string[] = [];
  for (const raw of [message.content, message.reasoning_content]) {
    if (typeof raw === "string" && raw.trim()) {
      candidates.push(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, ""));
    }
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    // Whole candidate first (clean JSON case).
    try {
      return JSON.parse(candidate);
    } catch {
      // fall through to balanced extraction
    }
    let cursor = 0;
    while (cursor < candidate.length) {
      const obj = firstBalancedObject(candidate.slice(cursor));
      if (!obj) break;
      try {
        return JSON.parse(obj);
      } catch {
        const idx = candidate.indexOf(obj, cursor);
        cursor = idx >= 0 ? idx + 1 : cursor + 1;
      }
    }
  }
  return null;
}

export async function chatWithImage(
  opts: { system: string; userText: string; images: ImageInput[] },
  deps?: { fetchFn?: FetchLike; timeoutMs?: number; now?: () => number },
): Promise<ChatResult> {
  const env = getServerEnv();
  if (!env.AI_API_KEY || !env.AI_MODEL || !env.AI_BASE_URL) {
    return { ok: false, error: "HTTP", status: 0, detail: "AI provider is not configured (AI_BASE_URL/AI_API_KEY/AI_MODEL)" };
  }
  const endpoint = `${env.AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  const fetchFn = deps?.fetchFn ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
  const started = deps?.now?.() ?? Date.now();

  const buildBody = (withResponseFormat: boolean) => ({
    model: env.AI_MODEL,
    messages: [
      { role: "system", content: opts.system },
      {
        role: "user",
        content: [
          { type: "text", text: opts.userText },
          ...opts.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
        ],
      },
    ],
    temperature: 0,
    ...(withResponseFormat ? { response_format: { type: "json_object" } } : {}),
  });

  const post = async (body: unknown): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.AI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const toResult = async (res: Response): Promise<ChatResult> => {
    const latencyMs = (deps?.now?.() ?? Date.now()) - started;
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
      return { ok: false, error: res.status === 401 || res.status === 403 || res.status === 429 ? "HTTP" : "HTTP", status: res.status, detail };
    }
    let payload: { choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: string }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    try {
      payload = await res.json();
    } catch {
      return { ok: false, error: "EMPTY", detail: "Non-JSON provider response" };
    }
    const message = payload.choices?.[0]?.message;
    const content = typeof message?.content === "string" && message.content.trim() ? message.content.trim() : null;
    const reasoningContent = typeof message?.reasoning_content === "string" && message.reasoning_content.trim() ? message.reasoning_content.trim() : null;
    const text = [content, reasoningContent].filter((t): t is string => t !== null).join("\n");
    if (!text) return { ok: false, error: "EMPTY", detail: `finish_reason=${payload.choices?.[0]?.finish_reason ?? "unknown"}` };
    return {
      ok: true,
      content,
      reasoningContent,
      text,
      model: payload.model ?? env.AI_MODEL ?? "unknown",
      latencyMs,
      usage: payload.usage ? { prompt: payload.usage.prompt_tokens ?? 0, completion: payload.usage.completion_tokens ?? 0 } : null,
    };
  };

  try {
    let res = await post(buildBody(true));
    if (res.status === 400) {
      // Some OpenAI-compatible providers reject response_format; retry once without it (safe, idempotent read).
      const detail = await res.clone().text().catch(() => "");
      if (/response_format/i.test(detail)) {
        res = await post(buildBody(false));
      }
    }
    return await toResult(res);
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return { ok: false, error: isTimeout ? "TIMEOUT" : "NETWORK", detail: err instanceof Error ? err.message : undefined };
  }
}

export function systemPromptForEvidence(): string {
  return [
    "You are an evidence-completeness assistant for a repair transaction. You are advisory only.",
    "You check whether a submission looks complete and internally consistent. You do NOT certify repair quality, authenticity, compatibility, or customer acceptance, and you never influence payment.",
    "Flag missing items or inconsistencies (for example: a component declaration that does not match the approved contract label, or a label photo claimed but not provided).",
    "Return ONLY one JSON object matching exactly this shape — no markdown, no extra keys:",
    `{`,
    `  "completeness": "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE",`,
    `  "flags": [ { "code": string, "severity": "BLOCKING_FOR_SUBMISSION" | "REVIEW" | "INFO", "message": string } ],`,
    `  "consistencyObservations": [ { "code": string, "severity": "REVIEW" | "INFO", "message": string } ],`,
    `  "limitations": [string]`,
    `}`,
  ].join("\n");
}
