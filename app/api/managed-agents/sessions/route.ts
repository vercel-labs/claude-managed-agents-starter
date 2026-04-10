import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { requireUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const rows = await db
    .select({
      id: managedAgentSession.id,
      title: managedAgentSession.title,
      updatedAt: managedAgentSession.updatedAt,
    })
    .from(managedAgentSession)
    .where(eq(managedAgentSession.userId, authz.userId))
    .orderBy(desc(managedAgentSession.updatedAt));

  return NextResponse.json({
    sessions: rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}
