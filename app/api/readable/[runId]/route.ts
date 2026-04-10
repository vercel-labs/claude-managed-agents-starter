import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { getRun } from "workflow/api";
import { requireUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const { runId } = await params;

  const [row] = await db
    .select({ id: managedAgentSession.id })
    .from(managedAgentSession)
    .where(
      and(
        eq(managedAgentSession.workflowRunId, runId),
        eq(managedAgentSession.userId, authz.userId),
      ),
    )
    .limit(1);

  if (!row) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  let run;
  try {
    run = getRun(runId);
  } catch {
    return Response.json(
      { error: "Run not found" },
      { status: 404 },
    );
  }

  const readable = run.getReadable();
  const encoder = new TextEncoder();
  const abortSignal = request.signal;

  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = (readable as unknown as ReadableStream).getReader();
      try {
        while (!abortSignal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          const data =
            typeof value === "string" ? value : JSON.stringify(value);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
        controller.close();
      } catch (e) {
        if (abortSignal.aborted) return;
        console.error(`[readable] stream error for runId=${runId}:`, e);
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
