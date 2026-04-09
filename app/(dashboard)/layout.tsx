import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { DashboardShell } from "./dashboard-shell";

async function getViewerAndSessions() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user?.id) return { viewer: null, sessions: [] };

    const viewer = {
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
    };

    const rows = await db
      .select({
        id: managedAgentSession.id,
        title: managedAgentSession.title,
        updatedAt: managedAgentSession.updatedAt,
        tailing: managedAgentSession.tailing,
      })
      .from(managedAgentSession)
      .where(eq(managedAgentSession.userId, session.user.id))
      .orderBy(desc(managedAgentSession.updatedAt))
      .limit(50);

    const sessions = rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
      tailing: r.tailing,
    }));

    return { viewer, sessions };
  } catch {
    return { viewer: null, sessions: [] };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { viewer, sessions } = await getViewerAndSessions();

  return (
    <DashboardShell viewer={viewer} initialSessions={sessions}>
      {children}
    </DashboardShell>
  );
}
