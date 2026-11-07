# RepairRelay — Data Model, Invariants and State Machines

## 1. Data design rules

- PostgreSQL is authoritative for business workflow state.
- All IDs are opaque UUIDs/ULIDs; public references are non-sequential.
- USD is the only demo currency.
- Persist monetary amounts as integer minor units (cents) using `BigInt` or integer-safe type supported by Prisma/Postgres; never JS float.
- Persist timestamps as UTC; render local timezone.
- Store raw provider status separately from normalized business status.
- Store only sanitized/minimized provider payloads needed for audit/reconciliation.
- Store image objects privately and refer to them by opaque storage key.
- Keep approved contract snapshots immutable.
- Keep Channel3 product IDs as references; do not reuse stale offer fields as current catalog data.
- Selected contract may retain the exact offer details as an immutable historical snapshot (price/currency/domain/offer URL at acceptance) for audit context, but do not render it as a current offer or use it for a later purchase without refreshing the listing.

## 2. Entities

### User

- `id`, `email` unique, `displayName`, `passwordHash` (if Credentials provider), `role` (`CUSTOMER`, `SIMULATED_REPAIRER`, `DEMO_ADMIN`), `createdAt`, `updatedAt`, `disabledAt?`.
- Demo accounts are seeded, no public sign-up in MVP.

### RepairRequest

- `id`, `publicReference`, `customerId`, `deviceBrand`, `deviceModel`, `modelIdentifier?`, `deviceModelConfidence` (`USER_SELECTED`, `AI_SUGGESTED`, `UNKNOWN`), `symptoms`, `repairCategory?`, `status`, `version`, timestamps.

### UploadedAsset

- `id`, `repairRequestId`, `ownerId`, `assetKind` (`INTAKE`, `BEFORE`, `AFTER`, `COMPONENT`, `OTHER`), `storageKey`, `mimeType`, `byteSize`, `width`, `height`, `sha256`, `createdAt`, `deletedAt?`.
- Never expose storage key or public path to unauthorized user.

### DiagnosisReport

- `id`, `repairRequestId`, `model/provider`, `schemaVersion`, `visibleObservations[]`, `suspectedCauses[]`, `likelyRepairCategory?`, `confidenceBand`, `unknowns[]`, `recommendedNextQuestions[]`, `rawOutputRedacted?`, `createdAt`, `supersededAt?`.
- Diagnosis reports are immutable; a re-run creates a new report.

### ProductSearchRun

- `id`, `repairRequestId`, `provider` (`CHANNEL3`), `query`, `country`, `currency`, `language`, `mode`, `providerRequestId?`, `status`, `resultCount`, `normalizationVersion`, `createdAt`, `completedAt?`, `errorCode?`.

### ProductCandidate

- `id`, `searchRunId`, `channel3ProductId` (stable external ID), `title`, `description?`, `brandData?`, `imageUrl?` (short-lived display metadata only; refresh before user-facing use), `createdAt`.
- Avoid storing offer price, availability or offer URL as current catalog attributes.

### OfferObservation

- Optional short-lived record of an offer observed from a product detail refresh: `id`, `productCandidateId`, `domain`, `offerUrl`, `priceMinor`, `currency`, `availability?`, `condition?`, `observedAt`, `expiresAt`.
- This is an observation for a UI/selection flow, not a cache to be displayed after `expiresAt`. Do not persist or reuse as live data after expiry. If Channel3 terms/response support restrict retention, store only in short-lived memory and contract snapshot as appropriate.

### SimulatedRepairer

- `id`, `userId`, `displayName`, `demoLabel` fixed to `SIMULATED`, `demoDescription`, `active`, `createdAt`.
- No credential, verification, rating or real location claims.

### RepairQuote

- `id`, `repairRequestId`, `repairerId`, `version`, `status`, `productCandidateId`, `channel3ProductId`, `offerObservationId?`, `componentLabel`, `compatibilityAttestation`, `compatibilityNotes`, `partChargeMinor`, `labourMinor`, `feesMinor`, `taxMinor`, `totalMinor`, `currency`, `warrantyDays?`, `warrantyText`, `estimatedDurationHours?`, `scopeText`, `exclusionsText`, `validUntil`, `createdAt`.
- `compatibilityAttestation` in demo is explicitly simulation data. It means the seeded actor selected a value, not independent technical verification.

### RepairContract

- `id`, `repairRequestId`, `selectedQuoteId`, `currentVersionId`, `status`, `version`, `currency`, `totalMinor`, `createdAt`, `updatedAt`, `approvedAt?`, `cancelledAt?`.

### ContractVersion

- `id`, `contractId`, `versionNumber`, `quoteSnapshotJson`, `productReferenceSnapshotJson`, `scopeSnapshot`, `warrantySnapshot`, `totalMinor`, `currency`, `changeReason?`, `createdBy`, `createdAt`, `customerApprovedAt?`, `supersededAt?`.
- Immutable after insert except approval metadata, if stored separately as event/decision.

### ContractChangeRequest

- `id`, `contractId`, `fromVersionId`, `proposedVersionId`, `requestedBy`, `reason`, `status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`), `customerDecisionAt?`, timestamps.

### RepairJob

- `id`, `repairRequestId`, `contractId`, `contractVersionId`, `repairerId`, `status`, `startedAt?`, `evidenceSubmittedAt?`, `acceptedAt?`, `cancelledAt?`, `reworkCount`, `createdAt`, `updatedAt`.

### EvidenceSubmission

- `id`, `repairJobId`, `contractVersionId`, `submittedBy`, `status` (`DRAFT`, `SUBMITTED`, `SUPERSEDED`), `componentDeclaration`, `componentIdentityBasis` (`LABEL_PHOTO`, `TECHNICIAN_DECLARATION`, `OTHER`), `functionalChecksJson`, `notes?`, `submittedAt?`, `createdAt`.

### EvidenceAsset

- `id`, `submissionId`, `uploadedAssetId`, `evidenceType` (`BEFORE`, `AFTER`, `COMPONENT_LABEL`, `OTHER`), `caption?`, `createdAt`.

### EvidenceAssessment

- `id`, `submissionId`, `provider`, `model`, `schemaVersion`, `completeness` (`COMPLETE`, `INCOMPLETE`, `UNAVAILABLE`), `flags[]`, `reasoningSummary`, `createdAt`.
- Advisory only. Must not be treated as customer acceptance.

### CustomerDecision

- `id`, `repairJobId`, `contractVersionId`, `customerId`, `decision` (`ACCEPT`, `REQUEST_REWORK`, `CANCEL`), `comment?`, `createdAt`.
- Immutable. One decision per evidence submission; rework creates a new submission and a new decision.

### PaymentAttempt / PaymentOperation

PaymentAttempt:
- `id`, `repairContractId`, `contractVersionId`, `provider` (`PAYPAL`), `providerEnvironment` (`SANDBOX`), `currency`, `amountMinor`, `status`, `paypalOrderId?`, `paypalAuthorizationId?`, `paypalCaptureId?`, `rawOrderStatus?`, `rawAuthorizationStatus?`, `rawCaptureStatus?`, `authorizationExpiresAt?`, `createdAt`, `updatedAt`.

PaymentOperation:
- `id`, `paymentAttemptId`, `operationType` (`CREATE_ORDER`, `AUTHORIZE`, `CAPTURE`, `VOID`, `RECONCILE`), `idempotencyKey`, `status` (`STARTED`, `SUCCEEDED`, `FAILED`, `UNKNOWN`), `requestHash`, `providerRequestId?`, `providerResponseRedacted?`, `errorCode?`, `startedAt`, `completedAt?`.
- Unique constraint for idempotency key per operation/provider scope.

### AuditEvent

- `id`, `aggregateType`, `aggregateId`, `actorType`, `actorId?`, `eventType`, `payloadAllowlistedJson`, `traceId`, `createdAt`.
- Append-only by application convention; no secrets, card data, raw images or full sensitive PII.

## 3. Core relationships

```text
User(customer) 1 ── N RepairRequest
RepairRequest 1 ── N UploadedAsset
RepairRequest 1 ── N DiagnosisReport
RepairRequest 1 ── N ProductSearchRun 1 ── N ProductCandidate
RepairRequest 1 ── N RepairQuote N ── 1 SimulatedRepairer
RepairRequest 1 ── 0..1 RepairContract
RepairContract 1 ── N ContractVersion
RepairContract 1 ── N ContractChangeRequest
RepairContract 1 ── N PaymentAttempt
RepairContract 1 ── 1 RepairJob
RepairJob 1 ── N EvidenceSubmission 1 ── N EvidenceAsset
EvidenceSubmission 1 ── N EvidenceAssessment
RepairJob 1 ── N CustomerDecision
Any aggregate 1 ── N AuditEvent
```

## 4. State machines

### Repair request

```text
DRAFT
  -> INTAKE_SUBMITTED
  -> DIAGNOSIS_PENDING -> DIAGNOSIS_READY | DIAGNOSIS_INCONCLUSIVE | DIAGNOSIS_FAILED
  -> PARTS_SEARCH_PENDING -> PARTS_AVAILABLE | PARTS_EMPTY | PARTS_SEARCH_FAILED
  -> QUOTES_PENDING -> QUOTES_AVAILABLE
  -> CONTRACT_SELECTED -> CONTRACT_APPROVED
  -> REPAIR_IN_PROGRESS -> EVIDENCE_SUBMITTED -> CUSTOMER_REVIEW
  -> COMPLETED | REWORK_IN_PROGRESS | CANCELLED
```

A `PARTS_EMPTY` or `PARTS_SEARCH_FAILED` state cannot be bypassed by inserting fake product candidates. A documented pivot to repair-versus-replace is a distinct mode, not a disguised successful spare-part search.

### Contract

```text
DRAFT -> AWAITING_CUSTOMER_APPROVAL -> APPROVED
APPROVED -> CHANGE_REQUESTED
CHANGE_REQUESTED -> CHANGE_APPROVED -> AWAITING_CUSTOMER_APPROVAL -> APPROVED (new version)
CHANGE_REQUESTED -> CHANGE_REJECTED -> APPROVED (old version remains)
APPROVED -> COMPLETED | CANCEL_REQUESTED -> CANCELLED
```

A new version does not overwrite old approved data. A contract can be approved only when quote, product reference, amount and currency are complete and current under the rules.

### Repair job

```text
NOT_STARTED -> IN_PROGRESS -> AWAITING_EVIDENCE -> CUSTOMER_REVIEW
CUSTOMER_REVIEW -> ACCEPTED
CUSTOMER_REVIEW -> REWORK_REQUESTED -> REWORK_IN_PROGRESS -> AWAITING_EVIDENCE
CUSTOMER_REVIEW -> CANCEL_REQUESTED -> CANCELLED (only after void if authorization exists)
```

For MVP, maximum rework cycles = 1. If more are requested, block with an explicit demo limitation or operator intervention; never silently accept endless loops.

### Payment attempt

```text
NOT_CREATED
 -> ORDER_CREATE_PENDING -> ORDER_CREATED
 -> BUYER_APPROVAL_PENDING -> BUYER_APPROVED | BUYER_CANCELLED
 -> AUTHORIZATION_PENDING -> AUTHORIZED | AUTHORIZATION_DECLINED | AUTHORIZATION_UNKNOWN

AUTHORIZED -> CAPTURE_PENDING -> CAPTURED | CAPTURE_FAILED | CAPTURE_UNKNOWN
AUTHORIZED -> VOID_PENDING -> VOIDED | VOID_FAILED | VOID_UNKNOWN
AUTHORIZED -> AUTHORIZATION_EXPIRED
```

Unknown is an operationally important state, not a failure that can be blindly retried. Reconcile provider status first.

### Provider/raw states

Store exact PayPal status and map to stable internal status. If PayPal introduces an unknown status, preserve the raw value and map to `PROVIDER_STATUS_UNKNOWN` / operator review, not success.

## 5. Cross-domain invariants

- `RepairContract.totalMinor = sum(line items)` using deterministic server calculation.
- `PaymentAttempt.amountMinor = approved ContractVersion.totalMinor`.
- `PaymentAttempt.currency = ContractVersion.currency`.
- A repair cannot enter `IN_PROGRESS` unless current contract is approved and payment is `AUTHORIZED`.
- A customer can accept only the latest evidence submission for the currently approved contract version.
- A capture command requires an accepted decision referencing the same contract version as the payment authorization.
- A void command cannot be used after confirmed capture; refund is a different provider flow and out of scope.
- A rework request cannot call capture.
- A rejected change request preserves the previous approved contract.
- A change in amount invalidates the old payment amount match; old authorization must be confirmed void before a new amount can be authorized.
- No stale or expired product offer is used for a new contract approval.
- Every meaningful transition emits an audit event with actor, aggregate, timestamp and trace ID.

## 6. Deletion and retention

The hackathon demo uses synthetic data. Provide a demo reset that deletes/recreates demo rows and private assets. Do not provide a user-controlled delete flow that would remove payment audit history while payment reconciliation is unresolved. Keep only minimal provider identifiers/status required for the demo. Never retain uploaded source photos beyond the demonstration's explicit purpose without user consent.
