import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/integrations/ai/client";

describe("AI output JSON extraction", () => {
  it("parses clean JSON content", () => {
    expect(extractJsonObject({ content: '{"a":1}' })).toEqual({ a: 1 });
  });

  it("parses fenced markdown JSON", () => {
    expect(extractJsonObject({ content: '```json\n{"a":2}\n```' })).toEqual({ a: 2 });
  });

  it("falls back to reasoning_content when content is null", () => {
    expect(extractJsonObject({ content: null, reasoning_content: 'thinking... {"a":3}' })).toEqual({ a: 3 });
  });

  it("extracts the outermost object when reasoning text wraps the JSON", () => {
    expect(
      extractJsonObject({
        content: null,
        reasoning_content: 'The user wants JSON. So: {"deviceModelAssessment": {"value": "iPhone 13"}, "ok": true} done.',
      }),
    ).toEqual({ deviceModelAssessment: { value: "iPhone 13" }, ok: true });
  });

  it("returns null for garbage", () => {
    expect(extractJsonObject({ content: "no json here" })).toBeNull();
    expect(extractJsonObject({ content: null, reasoning_content: null })).toBeNull();
  });
});
