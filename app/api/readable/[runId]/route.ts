import { NextRequest } from "next/server";
import { getRun } from "workflow/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  console.log(`[readable] GET runId=${runId}`);

  let run;
  try {
    run = getRun(runId);
  } catch (e) {
    console.error(`[readable] getRun failed:`, e);
    return Response.json(
      { ok: false, error: { code: "RUN_NOT_FOUND", message: `Run ${runId} not found` } },
      { status: 404 },
    );
  }

  const readable = run.getReadable();
  console.log(`[readable] stream opened for runId=${runId}`);

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
