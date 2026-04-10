import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { sendUserMessage } from "@/lib/managed-agents";
import { requireUserId } from "@/lib/session";
import { checkMessageRateLimit } from "@/lib/rate-limit";
import { tailSessionWorkflow } from "@/app/workflows/tail-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const rateCheck = checkMessageRateLimit(authz.userId);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: rateCheck.reason },
      { status: 429 },
    );
  }

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

  const isFirstMessage = row.title === "New chat";

  try {
    await sendUserMessage(row.anthropicSessionId, text);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const titleUpdate = isFirstMessage
    ? { title: text.length > 60 ? `${text.slice(0, 57)}...` : text }
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

  const run = await start(tailSessionWorkflow, [
    {
      internalSessionId: sessionId,
      anthropicSessionId: row.anthropicSessionId,
    },
  ]);

  await db
    .update(managedAgentSession)
    .set({ workflowRunId: run.runId })
    .where(eq(managedAgentSession.id, sessionId));

  return NextResponse.json({ ok: true, runId: run.runId });
}
