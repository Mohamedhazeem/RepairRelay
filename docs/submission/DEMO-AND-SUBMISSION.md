# RepairRelay — Hackathon Demo, Pitch and Submission Plan

**Target:** PayPal AI Hackathon 2026  
**Deadline:** 12 November 2026, 12:00 PM Pacific Standard Time = 13 November 2026, 1:30 AM IST.  
**Recommended internal deadline:** submit by 12 November 2026, 10:00 PM IST at the latest.

## 1. Competition strategy

Judging dimensions are equally weighted:

1. Technological implementation.
2. Design.
3. Potential impact.
4. Innovation / idea.
5. Presentation.

Channel3 sponsor challenge is a priority because the product can use its API in a meaningful, visible consumer workflow. Use the live `/v1/search` API directly. Do not claim MCP unless an actual MCP integration is implemented and demonstrated.

The strongest judge-facing narrative:

> A repair quote is not just a price. It is a promise about which part will be installed, what work will be done and what the customer will pay. RepairRelay connects those promises to evidence and customer-controlled payment capture.

Do not pitch as the first AI repair marketplace, an escrow product or a live repairer network.

## 2. 2-minute-40-second demo script

Target duration: 2:35–2:50, leaving margin below the three-minute maximum.

### 0:00–0:15 — Problem and hook

Show the RepairRelay repair request landing page and one cracked-screen photo.

Narration:

“Repairing a phone is not just about finding a technician. Customers often cannot tell which part is being quoted, whether the repairer will install that part, or what happens if the price changes. RepairRelay makes that agreement traceable.”

### 0:15–0:35 — AI repair intake

Select device model and upload image. Trigger the real vision model.

Show visible observations, likely repair category, confidence band and unknowns.

Narration:

“Our AI does visual triage. It separates what it can see from what still needs physical inspection. It never decides compatibility or authorizes money.”

### 0:35–1:00 — Live Channel3 discovery

Trigger a live search. Show returned product titles, merchant offers and current prices. Open a product's merchant link if time allows. Show the selected Channel3 product reference on the next screen.

Narration:

“Channel3 supplies real retail product discovery. Those results are candidate listings, not compatibility certification. We refresh the offer before it becomes part of a quote.”

Do not use a canned product result as a live result. If the live API is down, the recording should be rescheduled or the UI should honestly show an unavailable state; do not represent a fixture as live.

### 1:00–1:20 — Quotes and Repair Contract

Show three simulated repairer quote cards with part charge, labour, warranty and total. Select one and review contract. Make `SIMULATED REPAIRER` label visible.

Narration:

“Three simulated repairers quote against the same selected product candidate. The customer sees the part reference, separate labour and total, warranty and scope before approving.”

### 1:20–1:40 — PayPal authorization

Click the real PayPal sandbox button. Complete buyer approval. Show backend-confirmed `AUTHORIZED` status.

Narration:

“PayPal authorizes the amount before the simulated repair begins. This is a standard authorization, not escrow, and the sandbox merchant—not the simulated repairer—receives the capture.”

### 1:40–2:05 — Evidence and decision

Switch to simulated repairer workbench. Upload after photo, component declaration and functional checks. Return to customer view. Show evidence checklist. Click explicit Accept.

Narration:

“The repairer submits visual, component and functional evidence. AI checks completeness only. The customer—not the model—decides whether the repair is accepted.”

### 2:05–2:25 — Payment capture and Repair Passport

Show actual capture call completing and UI state changing from `AUTHORIZED` to `CAPTURED`. Show passport with contract reference, evidence and receipt.

Narration:

“Only after customer acceptance does the backend capture the PayPal authorization. The Repair Passport records the agreed part reference, contract version, declared component, evidence and payment receipt.”

### 2:25–2:45 — Differentiator close

Show contract version / change request or a short pre-recorded (but genuinely working) second test of a substitution requiring new customer approval.

Narration:

“If the repairer changes the part or price, they cannot silently rewrite the agreement. A new version requires customer approval. That is the trust gap RepairRelay is built to address.”

## 3. Alternate rejection demonstration

Prepare a separate test transaction (not the same payment authorization used for the happy path):

- Submit evidence.
- Customer selects `Request rework`.
- Show payment remains `AUTHORIZED`; no capture request.
- Repairer resubmits evidence.
- Or customer chooses `Cancel`; show confirmed `VOIDED`.

Do not attempt to show the happy path and rework loop in the same 3-minute video if it makes the payment capture climax unclear. Mention that the rejection path is covered in tests and show it in a short supplemental clip or judge instructions if allowed.

## 4. 60-second pitch

“RepairRelay is a parts-referenced repair transaction. A customer uploads a damaged-device photo, and AI produces an honest visual assessment with uncertainty. Channel3 finds real replacement-product offers. Simulated repairers quote against a selected candidate with separate part and labour costs. The customer approves a versioned Repair Contract, then authorizes payment through PayPal. The repairer submits installation and functional evidence. AI checks whether evidence is complete, but the customer makes the final decision. Only then does our backend capture the PayPal authorization. If the part or price changes, the contract must be reapproved. RepairRelay connects what was quoted, what was declared installed, what was evidenced and what was paid.”

## 5. Sponsor story

### Channel3

Show:
- actual `/v1/search` query request;
- live product cards and offer values;
- product ID carried into the selected quote/contract;
- detail refresh before selection;
- replacement-device comparison only if that was the approved fallback.

Explain why Channel3 changes the consumer decision. It is not a decorative image/search card; it informs the part candidate reference and repair-vs-replace benchmark.

### PayPal

Show:
- actual JS SDK buyer approval;
- backend `AUTHORIZE` operation;
- server-stored authorization ID;
- explicit customer decision;
- actual `CAPTURE` after acceptance;
- `VOID` behavior for cancellation/amount change in tests or secondary flow.

Do not say escrow or seller payout.

### AI

Show:
- multimodal image diagnosis;
- visible observation vs suspected fault vs unknown;
- advisory evidence completeness assessment;
- deterministic app-side contract diff/total and human acceptance.

Do not claim AI certifies the repair or controls payment.

## 6. Submission requirements checklist

As checked against the official rules on 8 November 2026:

- [ ] PayPal developer sandbox integration is functional.
- [ ] AI model/tool is meaningfully used.
- [ ] Functional demo is accessible to judges; a local full setup is acceptable if documented, but a live hosted demo is preferable only if stable.
- [ ] Public source repository URL supplied (GitHub, GitLab or Bitbucket).
- [ ] Open-source license file present at repository root.
- [ ] Public YouTube demo under 3 minutes.
- [ ] Video shows the actual functioning product, not slides only.
- [ ] All text/materials in English or include English translation.
- [ ] Demo data is synthetic; API secrets are not in repository/video.
- [ ] Judge login instructions/test credentials supplied through approved submission mechanism.
- [ ] No unlicensed music, logos or third-party copyrighted material in video.
- [ ] Channel3 usage described honestly; no MCP claim unless MCP actually used.
- [ ] Devpost form submitted; final receipt/page checked.

Official: https://paypalaihackathon.devpost.com/rules
Channel3 sponsor: https://paypalaihackathon.devpost.com/details/channel3

## 7. Repository and release requirements

Root files:
- `README.md` with concise elevator pitch, screenshots, setup, demo accounts, environment variables, run/test/build commands, architecture and known limitations.
- `LICENSE` (MIT included in this pack; verify team wants to use it).
- `.env.example` without secrets.
- no `.env`, `.env.local`, uploaded user images or raw API credentials in Git.

Docs:
- architecture, product spec, UX, integration instructions, implementation slices, edge tests, demo script and verification log.

Tests:
- unit + integration + E2E commands and actual final results.

Demo:
- record at 1920×1080 or 1280×720, readable browser zoom, no notifications/password manager prompts.
- use synthetic device/repair data and sandbox accounts.
- keep under 2:50 to leave upload/render margin.
- do not edit in a way that implies unperformed live operations.

## 8. Judge setup instructions template

```text
1. Clone the public repository.
2. Install the documented Node version.
3. Copy .env.example to .env.local and set database, AI, Channel3 and PayPal sandbox credentials.
4. Run the documented database migration and seed commands.
5. Start the app.
6. Sign in using the demo customer account from the private judge instructions.
7. Use the seeded simulated repairer account to submit completion evidence.
8. PayPal buyer approval uses the supplied sandbox buyer account.
9. The payment capture goes to the configured platform sandbox merchant. No real payment or repairer payout occurs.
```

If credentials cannot be supplied securely in the public README, provide safe access instructions in the submission's private testing notes. Do not publish real PayPal/Channel3/AI secrets.

## 9. Final submission timeline

- Nov 8: complete external API gates and choose primary/fallback product mode.
- Nov 9: diagnosis and product flow usable.
- Nov 10: contract and authorization integrated.
- Nov 11: evidence, customer decision, capture/void complete.
- Nov 12 morning IST: final regression, repository freeze, record video.
- Nov 12 evening IST: submit and verify receipt.

Do not add features after the final regression unless fixing a critical defect. Reserve time for video upload and Devpost field validation.
