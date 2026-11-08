import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionUser } from "@/lib/auth/session";
import { EnvironmentBanner } from "@/components/shell/EnvironmentBanner";
import { LogoutButton } from "@/components/shell/LogoutButton";

const NAV_BY_ROLE: Record<SessionUser["role"], Array<{ href: string; label: string }>> = {
  CUSTOMER: [
    { href: "/repairs", label: "Repairs" },
    { href: "/repairs", label: "Activity" },
  ],
  SIMULATED_REPAIRER: [{ href: "/repairer", label: "Workbench" }],
  DEMO_ADMIN: [{ href: "/admin/demo", label: "Demo operator" }],
};

export async function AppShell({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight">
              <span aria-hidden="true" className="text-brand">⇄</span> RepairRelay
            </Link>
            <EnvironmentBanner />
          </div>
          <div className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-muted">
                  {session.displayName} · <span className="font-medium">{roleLabel(session.role)}</span>
                </span>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login" className="rounded-control border border-line px-3 py-1.5 font-medium hover:bg-canvas">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {session ? (
        <nav aria-label="Primary" className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-7xl gap-1 px-4">
            {NAV_BY_ROLE[session.role].map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-muted hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-muted">
          Demo product data is simulated. Payments use the PayPal sandbox — authorization is not escrow and does not
          pay a repairer.
        </div>
      </footer>
    </div>
  );
}

function roleLabel(role: SessionUser["role"]): string {
  switch (role) {
    case "CUSTOMER":
      return "Customer";
    case "SIMULATED_REPAIRER":
      return "Simulated repairer";
    case "DEMO_ADMIN":
      return "Demo operator";
  }
}
