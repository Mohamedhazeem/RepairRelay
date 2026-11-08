// One-off S7 debug probe: replicates the evidence assessment call exactly.
import { chatWithImage, extractJsonObject, systemPromptForEvidence } from "../../src/integrations/ai/client";
import { EvidenceAssessmentSchema } from "../../src/domains/evidence/schema";

const result = await chatWithImage({
  system: systemPromptForEvidence(),
  userText: [
    "Assess the completeness/consistency of this repair evidence submission (advisory only).",
    `Component declaration: "OLED display assembly, technician-declared, installed and verified"`,
    `Identity basis: TECHNICIAN_DECLARATION`,
    `Functional checks: [{"check":"display_image","result":"PASS"},{"check":"touch_response","result":"PASS"},{"check":"brightness_control","result":"PASS"}]`,
    `After photos provided: 1; component label photos: 0.`,
    "Return only the JSON object per instructions.",
  ].join("\n"),
  images: [],
});
if (!result.ok) { console.log("CALL FAILED:", JSON.stringify(result)); process.exit(1); }
console.log("LEN:", result.text.length, "ENDS:", JSON.stringify(result.text.slice(-80)));
try { console.log("DIRECT PARSE OK"); JSON.parse(result.text); } catch (e) { console.log("DIRECT PARSE FAIL:", (e as Error).message); }
const extracted = extractJsonObject({ content: result.text });
console.log("EXTRACTED:", JSON.stringify(extracted)?.slice(0, 600));
const parsed = EvidenceAssessmentSchema.safeParse(extracted);
if (!parsed.success) {
  console.log("SCHEMA ISSUES:", JSON.stringify(parsed.error.issues, null, 1).slice(0, 900));
} else {
  console.log("SCHEMA OK:", parsed.data.completeness);
}
process.exit(0);
