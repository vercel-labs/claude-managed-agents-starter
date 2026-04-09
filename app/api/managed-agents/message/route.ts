import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { sendUserMessage, buildCodingPreamble } from "@/lib/managed-agents";
import { requireUserId } from "@/lib/session";
import { tailSessionWorkflow } from "@/app/workflows/tail-session";
import {
  getGithubTokenForUser,
  getGitHubIdentityForUser,
} from "@/lib/get-github-token";

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

  let messageText = text;

  const isFirstMessage = row.title === "New chat";
  const isCodingSession = Boolean(row.repoOwner && row.repoName);

  if (isFirstMessage && isCodingSession) {
    const token = await getGithubTokenForUser(authz.userId);
    if (!token) {
      return NextResponse.json(
        { error: "GitHub token not found. Please connect GitHub first." },
        { status: 400 },
      );
    }

    const identity = await getGitHubIdentityForUser(authz.userId);
    const preamble = buildCodingPreamble({
      token,
      owner: row.repoOwner!,
      repo: row.repoName!,
      baseBranch: row.baseBranch ?? "main",
      gitName: identity?.name ?? "Coding Agent",
      gitEmail:
        identity?.email ?? "coding-agent@users.noreply.github.com",
    });

    messageText = `${preamble}\n\n${text}`;
  }

  try {
    await sendUserMessage(row.anthropicSessionId, messageText);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const titleUpdate = isFirstMessage
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
