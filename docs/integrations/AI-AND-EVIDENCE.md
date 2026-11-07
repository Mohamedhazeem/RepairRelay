# RepairRelay — AI Diagnosis and Evidence Assessment Contract

## 1. AI's role

AI supports intake and evidence organization. It does not make irreversible transaction decisions.

Allowed:
- describe visual damage visible in user-provided image;
- classify likely repair category with uncertainty;
- list unknowns and questions for physical inspection;
- suggest a search phrase for Channel3;
- identify missing evidence categories;
- flag possible mismatch between repair category and evidence description;
- explain a deterministic contract diff in neutral language.

Not allowed:
- claim exact internal fault from an external photo when not visible;
- certify product compatibility, OEM authenticity or part quality;
- certify that repair is successful;
- approve a repair or accept evidence;
- trigger PayPal create/authorize/capture/void/refund;
- calculate authoritative prices, totals, amount differences or payment eligibility;
- invent product listings or merchant prices.

## 2. Provider requirements

AI provider must:
- accept image input (vision capable);
- support structured JSON output or reliable schema-constrained response;
- expose an API key independent from any consumer chatbot subscription;
- be callable server-side;
- have model/version pinned through environment configuration;
- allow prompts and output to be logged safely without storing raw user images in logs.

The project must fail clearly if AI credentials/model are unavailable. An automated test stub is not a user-facing substitute for a working AI demo unless explicitly labelled `AI TEST MODE`.

## 3. Diagnosis input

- User-selected device brand/model.
- Symptom description.
- Up to four sanitized images.
- Optional functionality checklist (screen output, touch, charging, camera, audio).

Do not infer user identity, location or sensitive personal attributes from image metadata; metadata is stripped before processing.

## 4. Diagnosis JSON contract

```json
{
  "deviceModelAssessment": {
    "value": "iPhone 13",
    "source": "USER_SELECTED",
    "needsConfirmation": false
  },
  "visibleObservations": [
    {
      "observation": "A crack is visible across the front display glass",
      "evidence": "intake-image-1",
      "certainty": "HIGH"
    }
  ],
  "suspectedCauses": [
    {
      "cause": "Display assembly may require replacement",
      "certainty": "MEDIUM",
      "basis": "Visible front glass damage"
    }
  ],
  "likelyRepairCategory": "DISPLAY_REPLACEMENT",
  "overallConfidence": "MEDIUM",
  "unknowns": [
    "Touch functionality has not been independently tested",
    "Underlying OLED damage cannot be confirmed from this image"
  ],
  "recommendedQuestions": [
    "Does touch respond across the entire screen?"
  ],
  "limitations": [
    "A physical inspection is required before confirming the exact fault"
  ]
}
```

This is a proposed application schema. Validate with Zod; version it. Do not display model-generated text without schema validation and safety checks. Use `LOW`, `MEDIUM`, `HIGH`, and `UNASSESSED`; no arbitrary percentages.

## 5. Diagnosis prompt rules

- State that the model is a visual triage assistant, not a repair technician.
- Describe only what is visually observable.
- Separate visible observations, hypotheses and unknowns.
- If image is blurry, dark, obstructed, unrelated or insufficient, mark inconclusive and ask for another photo.
- Do not infer exact device model from image if customer selected one; surface mismatch as a question.
- Do not produce OEM/aftermarket authenticity claims.
- Do not invent repair prices, stock or compatible products.
- Return only structured JSON; no markdown or extra keys.

## 6. Evidence checklist

For the screen-replacement demo:

### Visual
- at least one before photo from intake;
- at least one after photo showing repaired front/display;
- image quality/visibility adequate for a human to inspect.

### Component
- declared component description;
- relation to selected contract component;
- label/packaging photo when available.
- if no label photo, explicitly mark `TECHNICIAN_DECLARATION_ONLY`.

### Functional
- display image test;
- touch response test;
- brightness control test (where relevant);
- optional proximity/face unlock/camera test only if in scope and supported by demo.

Do not make tests impossible for the demo repair type. Keep checklist minimal and explain any optional item.

## 7. Evidence assessment output

```json
{
  "completeness": "INCOMPLETE",
  "flags": [
    {
      "code": "MISSING_AFTER_IMAGE",
      "severity": "BLOCKING_FOR_SUBMISSION",
      "evidenceItem": null,
      "message": "An after-repair image has not been submitted."
    }
  ],
  "consistencyObservations": [
    {
      "code": "COMPONENT_DECLARATION_NEEDS_REVIEW",
      "severity": "REVIEW",
      "message": "The submitted component description differs from the approved contract label. Confirm the substitution workflow was approved."
    }
  ],
  "limitations": [
    "This assessment checks submission completeness only; it does not certify repair quality or authenticity."
  ]
}
```

AI assessment must be advisory. Deterministic code validates mandatory fields and functional check presence; AI can flag visual/semantic issues. Customer retains decision authority even when AI marks complete or incomplete. Blocking requirements should be deterministic product rules, not inferred solely from model output.

## 8. Deterministic diff and arithmetic

Contract total, amount delta, field diff, accepted contract version and payment amount are computed by application code. AI may only render an explanation from the already-computed diff object. The AI must not invent missing before/after values.

## 9. Error and privacy behavior

- AI timeout: show “AI assessment unavailable”; retain request and allow retry/manual continuation where possible.
- Schema failure: reject output, log safe validation summary, allow retry.
- Image too large/unsupported: reject before AI call.
- No usable image: do not claim visual diagnosis.
- AI key/model missing: disable AI feature with setup guidance; do not silently display canned diagnosis in the judge flow.
- Never log raw base64 image, complete image URL with sensitive access token, or provider secret.
