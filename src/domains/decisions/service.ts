/**
 * Customer decision service (S06 scope): explicit accept / rework / cancel.
 * Decisions are immutable, reference the latest submitted evidence and the
 * current contract version, and never silently trigger payment. Accept/cancel
 * orchestration (capture/void) is invoked through the S04 payment contract —
 * in this slice the orchestration hooks are injected so tests can verify the
 * branching without provider calls; S9 wires the real provider adapters.
 */

import { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/lib/audit";

export const MAX_REWORK_CYCLES = 1;

export type DecisionOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN"; message: string };

function fail<T>(code: "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN", message: string): DecisionOutcome<T> {
  return { ok: false, code, message };
}

export type DecisionInput = {
  evidenceSubmissionId: string;
  contractVersionId: string;
  decision: "ACCEPT" | "REQUEST_REWORK" | "CANCEL";
  comment?: string;
};

export type DecisionOrchestration = {
  /** Called on ACCEPT after the decision is recorded. S9 wires the real capture. */
  capture?: (ctx: { repairId: string; contractId: string }) => Promise<void>;
  /** Called on CANCEL when an uncaptured authorization exists. S9 wires the real void. */
  void?: (ctx: { repairId: string; contractId: string }) => Promise<void>;
};

export type RecordedDecision = {
  decisionId: string;
  decision: "ACCEPT" | "REQUEST_REWORK" | "CANCEL";
  jobStatus: string;
  /** Whether a payment orchestration action was requested (capture on accept, void on cancel). */
  orchestrationRequested: boolean;
};

export async function recordCustomerDecision(
  prisma: PrismaClient,
  repairId: string,
  customerId: string,
  input: DecisionInput,
  orchestration?: DecisionOrchestration,
): Promise<DecisionOutcome<RecordedDecision>> {
  const repair = await prisma.repairRequest.findUnique({
    where: { id: repairId },
    include: {
      jobs: { include: { submissions: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "desc" } }, decisions: true } },
      contract: true,
    },
  });
  if (!repair || repair.customerId !== customerId) {
    return fail("NOT_FOUND", "Repair request not found");
  }
  const job = repair.jobs[0];
  const contract = repair.contract;
  if (!job || !contract) return fail("NOT_FOUND", "No active job for this repair");
  if (job.contractVersionId !== input.contractVersionId) {
    return fail("CONFLICT", "The contract changed — review the latest version before deciding");
  }
  const latest = job.submissions[0];
  if (!latest) return fail("VALIDATION_ERROR", "No submitted evidence is awaiting your decision");
  if (latest.id !== input.evidenceSubmissionId) {
    return fail("CONFLICT", "That evidence submission is superseded — only the latest submission can be decided");
  }
  if (job.status !== "CUSTOMER_REVIEW") {
    return fail("CONFLICT", `The job is ${job.status.toLowerCase().replaceAll("_", " ")} — no decision is possible now`);
  }
  if (job.decisions.some((d) => d.evidenceSubmissionId === input.evidenceSubmissionId)) {
    return fail("CONFLICT", "A decision was already recorded for this evidence submission");
  }
  if (input.decision === "REQUEST_REWORK") {
    const comment = input.comment?.trim() ?? "";
    if (comment.length < 10) return fail("VALIDATION_ERROR", "A rework comment (at least 10 characters) is required");
  }

  let orchestrationRequested = false;

  if (input.decision === "ACCEPT") {
    const decision = await prisma.customerDecision.create({
      data: {
        repairJobId: job.id,
        evidenceSubmissionId: latest.id,
        contractVersionId: input.contractVersionId,
        customerId,
        decision: "ACCEPT",
        comment: input.comment?.trim() || null,
      },
    });
    await prisma.repairJob.update({ where: { id: job.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await writeAudit(prisma, {
      aggregateType: "RepairJob",
      aggregateId: job.id,
      actorType: "CUSTOMER",
      actorId: customerId,
      eventType: "decision.accepted",
      payload: { decisionId: decision.id, submissionId: latest.id },
    });
    // Capture orchestration happens through the S04 contract only — never from AI/evidence code.
    if (orchestration?.capture) {
      await orchestration.capture({ repairId, contractId: contract.id });
      orchestrationRequested = true;
    }
    return { ok: true, result: { decisionId: decision.id, decision: "ACCEPT", jobStatus: "ACCEPTED", orchestrationRequested } };
  }

  if (input.decision === "REQUEST_REWORK") {
    if (job.reworkCount >= MAX_REWORK_CYCLES) {
      return fail("CONFLICT", "The demo allows one rework cycle — contact the operator for anything further");
    }
    const decision = await prisma.customerDecision.create({
      data: {
        repairJobId: job.id,
        evidenceSubmissionId: latest.id,
        contractVersionId: input.contractVersionId,
        customerId,
        decision: "REQUEST_REWORK",
        comment: input.comment!.trim(),
      },
    });
    await prisma.repairJob.update({
      where: { id: job.id },
      data: { status: "REWORK_IN_PROGRESS", reworkCount: { increment: 1 } },
    });
    // The old submission is superseded so the repairer can submit fresh evidence.
    await prisma.evidenceSubmission.update({ where: { id: latest.id }, data: { status: "SUPERSEDED" } });
    await writeAudit(prisma, {
      aggregateType: "RepairJob",
      aggregateId: job.id,
      actorType: "CUSTOMER",
      actorId: customerId,
      eventType: "decision.rework_requested",
      payload: { decisionId: decision.id, reworkCount: job.reworkCount + 1 },
    });
    // No capture, no void — the authorization stays as-is while rework runs.
    return { ok: true, result: { decisionId: decision.id, decision: "REQUEST_REWORK", jobStatus: "REWORK_IN_PROGRESS", orchestrationRequested } };
  }

  // CANCEL: void orchestration only when an uncaptured authorization exists.
  const payment = await prisma.paymentAttempt.findFirst({
    where: { repairContractId: contract.id },
    orderBy: { createdAt: "desc" },
  });
  const hasVoidableAuth = Boolean(payment && payment.status === "AUTHORIZED");
  const decision = await prisma.customerDecision.create({
    data: {
      repairJobId: job.id,
      evidenceSubmissionId: latest.id,
      contractVersionId: input.contractVersionId,
      customerId,
      decision: "CANCEL",
      comment: input.comment?.trim() || null,
    },
  });
  if (hasVoidableAuth) {
    await prisma.repairJob.update({ where: { id: job.id }, data: { status: "CANCEL_REQUESTED" } });
    await writeAudit(prisma, {
      aggregateType: "RepairJob",
      aggregateId: job.id,
      actorType: "CUSTOMER",
      actorId: customerId,
      eventType: "decision.cancel_requested",
      payload: { decisionId: decision.id, voidPending: true },
    });
    if (orchestration?.void) {
      await orchestration.void({ repairId, contractId: contract.id });
      orchestrationRequested = true;
    }
    // Final CANCELLED state is set by S9 only after a confirmed void.
    return { ok: true, result: { decisionId: decision.id, decision: "CANCEL", jobStatus: "CANCEL_REQUESTED", orchestrationRequested } };
  }
  // No authorization exists — cancel completes without any provider call.
  await prisma.repairJob.update({ where: { id: job.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await prisma.repairRequest.update({ where: { id: repairId }, data: { status: "CANCELLED" } });
  await writeAudit(prisma, {
    aggregateType: "RepairJob",
    aggregateId: job.id,
    actorType: "CUSTOMER",
    actorId: customerId,
    eventType: "decision.cancelled",
    payload: { decisionId: decision.id, withoutAuthorization: true },
  });
  return { ok: true, result: { decisionId: decision.id, decision: "CANCEL", jobStatus: "CANCELLED", orchestrationRequested } };
}
