import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (session) {
    redirect(
      session.role === "CUSTOMER" ? "/repairs" : session.role === "SIMULATED_REPAIRER" ? "/repairer" : "/admin/demo",
    );
  }
  redirect("/login");
}
