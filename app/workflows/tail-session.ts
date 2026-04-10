import { sleep, getWritable } from "workflow";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { getAnthropic } from "@/lib/anthropic";
import { anthropicEventId } from "@/lib/managed-agent-events";

const MAX_POLLS = 500;
const POLL_INTERVAL = "3s";

export type SessionEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

interface PollResult {
  lastEventId: string | null;
  done: boolean;
}

async function pollAndStream(input: {
  anthropicSessionId: string;
  lastEventId: string | null;
}): Promise<PollResult> {
  "use step";

  console.log(`[pollAndStream] START session=${input.anthropicSessionId} lastEventId=${input.lastEventId}`);

  const client = getAnthropic();
  const writer = getWritable<SessionEvent>().getWriter();

  let done = false;
  let lastId = input.lastEventId;
  let written = 0;

  try {
    const page = await client.beta.sessions.events.list(
      input.anthropicSessionId,
      { limit: 100 },
    );

    console.log(`[pollAndStream] fetched ${page.data.length} events`);

    const newEvents: Array<{ aid: string; event: typeof page.data[number] }> = [];
    let seenLast = input.lastEventId === null;
    for (const event of page.data) {
      const aid = anthropicEventId(event);
      if (!aid) continue;

      if (!seenLast) {
        if (aid === input.lastEventId) seenLast = true;
        continue;
      }

      newEvents.push({ aid, event });
    }

    for (const { aid, event } of newEvents) {
      const occurredAt =
        "processed_at" in event &&
        typeof (event as { processed_at?: string | null }).processed_at ===
          "string"
          ? (event as { processed_at: string }).processed_at
          : new Date().toISOString();

      await writer.write({
        id: aid,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        occurredAt,
      });

      written++;
      lastId = aid;
    }

    const lastEvent = newEvents[newEvents.length - 1];
    if (lastEvent) {
      const t = lastEvent.event.type;
      if (
        t === "session.status_idle" ||
        t === "session.status_terminated" ||
        t === "session.deleted"
      ) {
        done = true;
      }
    }
  } finally {
    writer.releaseLock();
  }

  console.log(`[pollAndStream] DONE wrote=${written} lastId=${lastId} done=${done}`);
  return { lastEventId: lastId, done };
}

async function markTailingDone(internalSessionId: string) {
  "use step";
  console.log(`[markTailingDone] START session=${internalSessionId}`);

  await db
    .update(managedAgentSession)
    .set({ tailing: false })
    .where(eq(managedAgentSession.id, internalSessionId));

  console.log(`[markTailingDone] DONE`);
}

export async function tailSessionWorkflow(input: {
  internalSessionId: string;
  anthropicSessionId: string;
}) {
  "use workflow";

  console.log(`[tailSessionWorkflow] START internal=${input.internalSessionId} anthropic=${input.anthropicSessionId}`);

  let lastEventId: string | null = null;

  for (let i = 0; i < MAX_POLLS; i++) {
    if (i > 0) await sleep(POLL_INTERVAL);

    const result = await pollAndStream({
      anthropicSessionId: input.anthropicSessionId,
      lastEventId,
    });

    lastEventId = result.lastEventId;
    console.log(`[tailSessionWorkflow] poll ${i} done=${result.done} lastEventId=${lastEventId}`);

    if (result.done) break;
  }

  await markTailingDone(input.internalSessionId);
  console.log(`[tailSessionWorkflow] DONE`);
}
