import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PrismaClient, type RepairStatus } from "@prisma/client";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guards";
import { StatusBadge, type Tone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/states";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

const ACTIVE_STATUSES: RepairStatus[] = [
  "DRAFT",
  "INTAKE_SUBMITTED",
  "DIAGNOSIS_PENDING",
  "DIAGNOSIS_READY",
  "DIAGNOSIS_INCONCLUSIVE",
  "DIAGNOSIS_FAILED",
  "PARTS_SEARCH_PENDING",
  "PARTS_AVAILABLE",
  "PARTS_EMPTY",
  "PARTS_SEARCH_FAILED",
  "QUOTES_PENDING",
  "QUOTES_AVAILABLE",
  "CONTRACT_SELECTED",
  "CONTRACT_APPROVED",
  "REPAIR_IN_PROGRESS",
  "EVIDENCE_SUBMITTED",
  "CUSTOMER_REVIEW",
  "REWORK_IN_PROGRESS",
];

/** Human labels for the audit event types the dashboard surfaces. */
const EVENT_LABELS: Record<string, string> = {
  "repair_request.created": "Repair request created",
  "repair_request.asset_uploaded": "Photo uploaded",
  "diagnosis.completed": "AI assessment completed",
  "diagnosis.failed": "AI assessment unavailable",
  "diagnosis.schema_rejected": "AI output rejected by validation",
  "product_search.performed": "Product search run",
  "product_offer.refreshed": "Offer refreshed",
  "product_selected": "Replacement reference selected",
  "quotes.generated": "Repairer quotes generated",
  "quote.selected": "Quote selected",
  "contract.created": "Repair contract drafted",
  "contract.approved": "Contract approved",
  "contract.change_requested": "Change request proposed",
  "contract.change_approved": "Change approved",
  "contract.change_rejected": "Change rejected",
  "payment.order_created": "PayPal order created",
  "payment.authorized": "Payment authorized",
  "payment.authorization_failed": "Authorization failed",
  "payment.authorization_amount_mismatch": "Authorization amount mismatch blocked",
  "payment.buyer_cancelled": "Buyer cancelled the approval",
  "payment.capture_pending": "Capture pending confirmation",
  "payment.captured": "Payment captured",
  "payment.capture_failed": "Capture failed",
  "payment.voided": "Authorization voided",
  "payment.voided_for_contract_change": "Authorization voided for a contract change",
  "payment.void_failed": "Void failed",
  "payment.authorization_expired": "Authorization expired",
  "payment.reconciled": "Payment status reconciled",
  "job.started": "Repair started",
  "evidence.asset_uploaded": "Evidence photo uploaded",
  "evidence.submitted": "Evidence submitted",
  "decision.accepted": "Repair accepted",
  "decision.rework_requested": "Rework requested",
  "decision.cancel_requested": "Cancellation requested",
  "decision.cancelled": "Repair cancelled",
};

function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll(".", " ").replaceAll("_", " ");
}

type RepairRow = {
  id: string;
  publicReference: string;
  deviceBrand: string;
  deviceModel: string;
  status: RepairStatus;
  updatedAt: Date;
  contract: {
    id: string;
    status: string;
    totalMinor: number;
    currency: string;
    version: number;
    paymentAttempts: Array<{ id: string; status: string }>;
  } | null;
  quotes: Array<{ id: string; repairer: { displayName: string } }>;
  jobs: Array<{ id: string; status: string }>;
};

function nextAction(repair: RepairRow): { label: string; href: string | null } {
  const base = `/repairs/${repair.id}`;
  const job = repair.jobs[0];

  if (repair.status === "COMPLETED") return { label: "View Repair Passport", href: `${base}/passport` };
  if (repair.status === "CANCELLED") return { label: "Cancelled", href: null };

  if (job) {
    switch (job.status) {
      case "CUSTOMER_REVIEW":
        return { label: "Review evidence and decide", href: base };
      case "IN_PROGRESS":
      case "AWAITING_EVIDENCE":
        return { label: "Repair in progress", href: base };
      case "REWORK_REQUESTED":
      case "REWORK_IN_PROGRESS":
        return { label: "Rework in progress", href: base };
      case "ACCEPTED":
        return { label: "Accepted — confirming payment", href: base };
      case "CANCEL_REQUESTED":
        return { label: "Cancelling — confirming void", href: base };
      case "CANCELLED":
        return { label: "Cancelled", href: null };
      default:
        break;
    }
  }

  switch (repair.status) {
    case "DRAFT":
    case "INTAKE_SUBMITTED":
      return { label: "Run AI assessment", href: base };
    case "DIAGNOSIS_PENDING":
      return { label: "AI assessment running", href: base };
    case "DIAGNOSIS_READY":
    case "DIAGNOSIS_INCONCLUSIVE":
    case "DIAGNOSIS_FAILED":
      return { label: "Review AI assessment", href: base };
    case "PARTS_SEARCH_PENDING":
    case "PARTS_AVAILABLE":
    case "PARTS_EMPTY":
    case "PARTS_SEARCH_FAILED":
      return { label: "Find replacement devices", href: `${base}/products` };
    case "QUOTES_PENDING":
    case "QUOTES_AVAILABLE":
      return { label: "Compare repairer quotes", href: `${base}/quotes` };
    case "CONTRACT_SELECTED":
      return { label: "Review contract", href: `${base}/contract` };
    case "CONTRACT_APPROVED":
      return { label: "Continue to PayPal authorization", href: `${base}/payment` };
    case "EVIDENCE_SUBMITTED":
      return { label: "Review evidence and decide", href: base };
    case "REWORK_IN_PROGRESS":
      return { label: "Rework in progress", href: base };
    default:
      return { label: "View repair", href: base };
  }
}

function toneForStatus(status: RepairStatus): Tone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "CANCELLED":
      return "danger";
    case "CUSTOMER_REVIEW":
    case "EVIDENCE_SUBMITTED":
      return "info";
    case "CONTRACT_APPROVED":
    case "CONTRACT_SELECTED":
    case "QUOTES_AVAILABLE":
    case "PARTS_AVAILABLE":
    case "DIAGNOSIS_READY":
      return "brand";
    default:
      return "neutral";
  }
}

export default async function RepairsPage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const guard = requireRole(session, "CUSTOMER");
  if (!guard.ok) redirect(guard.code === "UNAUTHENTICATED" ? "/login?next=/repairs" : "/");

  const repairs = await prisma.repairRequest.findMany({
    where: { customerId: guard.session.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      publicReference: true,
      deviceBrand: true,
      deviceModel: true,
      status: true,
      updatedAt: true,
      contract: {
        select: {
          id: true,
          status: true,
          totalMinor: true,
          currency: true,
          version: true,
          paymentAttempts: { select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      quotes: {
        where: { status: "SELECTED" },
        select: { id: true, repairer: { select: { displayName: true } } },
        take: 1,
      },
      jobs: { select: { id: true, status: true }, take: 1 },
    },
  });

  // Activity feed: audit events across this customer's repairs, contracts, jobs and payments.
  const aggregateIds = new Set<string>();
  for (const r of repairs) {
    aggregateIds.add(r.id);
    if (r.contract) {
      aggregateIds.add(r.contract.id);
      for (const p of r.contract.paymentAttempts) aggregateIds.add(p.id);
    }
    for (const j of r.jobs) aggregateIds.add(j.id);
  }
  const activity = aggregateIds.size
    ? await prisma.auditEvent.findMany({
        where: { aggregateId: { in: [...aggregateIds] } },
        orderBy: { createdAt: "desc" },
        take: 15,
      })
    : [];

  const active = repairs.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const recent = repairs.filter((r) => !ACTIVE_STATUSES.includes(r.status)).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your repair requests</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Your payment is authorized first and captured only after you accept the submitted repair evidence.
          </p>
        </div>
        <Link
          href="/repairs/new"
          className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Start a repair
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Active</h2>
        {active.length === 0 ? (
          <EmptyState
            title="No active repairs"
            description="Start a repair to get an honest AI assessment, live replacement-device prices and itemized simulated quotes."
            action={
              <Link
                href="/repairs/new"
                className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Start a repair
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {active.map((repair) => {
              const action = nextAction(repair);
              const repairer = repair.quotes[0]?.repairer.displayName ?? null;
              const payment = repair.contract?.paymentAttempts[0] ?? null;
              return (
                <li key={repair.id} className="rounded-card border border-line bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {repair.deviceBrand} {repair.deviceModel}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        Reference {repair.publicReference} · updated {repair.updatedAt.toLocaleDateString("en-US")}
                      </p>
                    </div>
                    <StatusBadge label={repair.status.replaceAll("_", " ")} tone={toneForStatus(repair.status)} />
                  </div>

                  <dl className="mt-3 space-y-1 text-sm">
                    {repairer ? (
                      <div className="flex justify-between">
                        <dt className="text-muted">Repairer</dt>
                        <dd>{repairer.toLowerCase().includes("simulated") ? repairer : `${repairer} (simulated)`}</dd>
                      </div>
                    ) : null}
                    {repair.contract ? (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-muted">Contract total</dt>
                          <dd className="font-semibold">
                            {formatUsd(repair.contract.totalMinor)}{" "}
                            <span className="text-xs font-normal text-muted">
                              v{repair.contract.version} · {repair.contract.currency}
                            </span>
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted">Payment</dt>
                          <dd>{payment ? payment.status.replaceAll("_", " ").toLowerCase() : "not started"}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm text-muted">{action.label}</span>
                    {action.href ? (
                      <Link
                        href={action.href}
                        className="rounded-control border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft"
                      >
                        Open
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recent.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Completed and cancelled</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {recent.map((repair) => {
              const action = nextAction(repair);
              return (
                <li key={repair.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {repair.deviceBrand} {repair.deviceModel}
                    </p>
                    <p className="text-xs text-muted">
                      Reference {repair.publicReference} · {repair.status === "COMPLETED" ? "completed" : "cancelled"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge label={repair.status.replaceAll("_", " ")} tone={toneForStatus(repair.status)} />
                    {action.href ? (
                      <Link href={action.href} className="text-sm font-medium text-brand hover:underline">
                        {action.label}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section id="activity">
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted">No activity yet. Events appear here as your repair progresses.</p>
        ) : (
          <ol className="space-y-2 rounded-card border border-line bg-surface p-5">
            {activity.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="w-full shrink-0 text-xs text-muted sm:w-40">
                  {new Date(e.createdAt).toLocaleString("en-US")}
                </span>
                <span className="min-w-0 flex-1">{eventLabel(e.eventType)}</span>
                <span className="text-xs text-muted">({e.actorType.toLowerCase().replaceAll("_", " ")})</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
