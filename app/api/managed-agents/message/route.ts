import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { sendUserMessage } from "@/lib/managed-agents";
import { requireUserId } from "@/lib/session";
import { tailSessionWorkflow } from "@/app/workflows/tail-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  let body: { sessionId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  const text = body.text?.trim();
  if (!sessionId || !text) {
    return NextResponse.json(
      { error: "sessionId and text are required" },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(managedAgentSession)
    .where(
      and(
        eq(managedAgentSession.id, sessionId),
        eq(managedAgentSession.userId, authz.userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    await sendUserMessage(row.anthropicSessionId, text);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const titleUpdate =
    row.title === "New chat"
      ? { title: text.length > 60 ? `${text.slice(0, 57)}…` : text }
      : {};

  await db
    .update(managedAgentSession)
    .set({
      tailing: true,
      updatedAt: new Date(),
      ...titleUpdate,
    })
    .where(
      and(
        eq(managedAgentSession.id, sessionId),
        eq(managedAgentSession.userId, authz.userId),
      ),
    );

  await start(tailSessionWorkflow, [
    {
      internalSessionId: sessionId,
      anthropicSessionId: row.anthropicSessionId,
    },
  ]);

  return NextResponse.json({ ok: true });
}
