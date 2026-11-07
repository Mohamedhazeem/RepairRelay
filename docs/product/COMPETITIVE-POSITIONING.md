# RepairRelay — Competitive Positioning and Wedge

**Research date:** 8 November 2026  
**Use:** pitch framing and product prioritization, not a claim that the listed competitors' advertised features have been independently tested.

## 1. Competitive reality

RepairRelay must not claim that AI repair diagnosis, part discovery, verified repairers, transparent quotes, job tracking or completion-based escrow are individually new. Current products publicly market several of these features.

| Product | Publicly described capability | What RepairRelay should learn |
|---|---|---|
| Efixel | Pre-launch electronics repair platform in Pune; describes AI technician matching, vetted technicians, transparent itemized pricing, live tracking, escrow-style payment and warranty. Its legal disclaimer says services/features are planned and pre-launch. | Technician matching + upfront quotes + completion-held payment is not a defensible standalone USP. [Source](https://efixel.com/) · [Pre-launch disclaimer](https://efixel.com/disclaimer) |
| ZOPERZ | Consumer ownership/warranty platform plus verified repair partners; advertises in-app payments/escrow and partner payouts, with city-by-city rollout/early access language. | Trust and payment protection alone are not unique. [Source](https://www.zoperz.com/) · [About](https://www.zoperz.com/about) |
| TechsyMarket | Publicly describes reviewed repair vendors, device-type matching, instant pricing or quotes, booking and repair tracking. | Vendor screening, quote comparison and status tracking are already familiar marketplace features. [Source](https://techsymarket.com/) |
| iFixit FixBot | AI repair assistant with image-based diagnostics, device selection, repair guidance and access to parts/repair knowledge. | AI diagnosis + part guidance is not itself the moat. RepairRelay should focus on transaction integrity beyond diagnosis. [Source](https://www.ifixit.com/go/FixBot) · [FixBot Pro](https://www.ifixit.com/Info/FixBot_Pro) |
| RepairDesk | Repair-shop management software for repair operations, inventory, parts and payments (B2B context). | Avoid building an entire repair-shop ERP in a short hackathon. Focus on the customer-facing contract/payment bridge. [Source](https://www.repairdesk.co/) |

Public marketing claims, launch state and market coverage can change. Efixel explicitly describes itself as pre-launch; ZOPERZ describes an early-access/city rollout. Do not represent competitor landing-page claims as proven production performance.

## 2. Defensible wedge

**Parts-reference → contract version → installed-part declaration → evidence → customer decision → PayPal state.**

The product is differentiated by the continuity of these records in one transaction, not by any one component.

### Three mechanisms to make visible

1. **Reference continuity:** a selected Channel3 product ID and a fresh merchant offer are carried into the quote and approved contract. The product is a candidate, not a fitment guarantee.
2. **Change control:** any component/scope/price substitution becomes an explicit versioned request. The customer approves or rejects it; the old version remains immutable.
3. **Payment decision integrity:** evidence is submitted and reviewed by the human customer. AI provides a completeness checklist only. Capture occurs only after customer acceptance.

## 3. Channel3's meaningful role

A decorative product carousel is not enough. Channel3 must influence a real decision:

- help customers compare replacement-part candidates and retail offers;
- anchor a quote to the selected canonical product ID/offer observation;
- support a repair-versus-replace comparison if live spare-part coverage is weak;
- provide a merchant buy-link and fresh price context at contract approval.

Do not claim Channel3 certifies component fitment, authenticity, warranty or current stock beyond returned offer fields. Refresh offers as required by Channel3's caching guidance.

## 4. Positioning statement

> RepairRelay is a parts-referenced repair transaction experience. It connects the product listing a customer considered, the repair quote they approved, the repair evidence submitted and the PayPal payment outcome—while requiring customer approval for material changes and completion.

## 5. Claims to use / avoid

### Use

- “A differentiated combination of parts-reference traceability, approved contract changes and evidence-based payment capture.”
- “Customer-controlled acceptance.”
- “Simulated repairer attestation in this hackathon demo.”
- “PayPal sandbox authorization and capture.”
- “Channel3-powered product discovery.”

### Avoid

- “First AI repair marketplace.”
- “The only repair marketplace with escrow.”
- “Guaranteed compatible parts.”
- “Verified technicians” for seeded demo actors.
- “PayPal escrow” or “PayPal pays the repairer.”
- “AI verifies the repair.”

## 6. Why this can score

- **Technical implementation:** real vision call, live Channel3 API, typed offer adapter, PayPal approval/authorization/capture/void and idempotent state transitions.
- **Design:** clear comparison and contract, evidence panel and visible payment timeline.
- **Potential impact:** better repair decisions and more transparent component/price commitments may reduce uncertainty that contributes to premature device replacement. Present environmental benefit as plausible potential, not measured impact.
- **Innovation:** a continuous parts-to-contract-to-evidence-to-payment record, including customer-approved substitutions.
- **Presentation:** a short demo where judges see the selected Channel3 listing travel into the contract and `AUTHORIZED` change to `CAPTURED` only after acceptance.
