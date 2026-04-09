import { eq } from "drizzle-orm";
import type { BetaManagedAgentsSessionEvent } from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { db } from "@/lib/db";
import { managedAgentEvent, managedAgentSession } from "@/lib/schema";
import { getAnthropic } from "@/lib/anthropic";
import {
  anthropicEventId,
  eventOccurredAt,
  isTerminalManagedAgentEvent,
} from "@/lib/managed-agent-events";

const MAX_POLLS = 500;
const POLL_INTERVAL_MS = 3_000;
const IDLE_POLLS_BEFORE_EXIT = 60;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollAndPersistStep(input: {
  internalSessionId: string;
  anthropicSessionId: string;
}) {
  "use step";

  const { internalSessionId, anthropicSessionId } = input;
  const client = getAnthropic();
  let idleCount = 0;

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    if (attempt > 0) {
      await delay(POLL_INTERVAL_MS);
    }

    let page = await client.beta.sessions.events.list(anthropicSessionId, {
      order: "desc",
      limit: 50,
    });

    let latestUserMessageTime = 0;
    let latestTerminalTime = 0;
    let insertedAny = false;

    for (;;) {
      const items = page.data ?? [];
      if (items.length === 0) break;

      let pageAllDuplicates = true;

      for (const ev of items as BetaManagedAgentsSessionEvent[]) {
        const aid = anthropicEventId(ev);
        if (!aid) continue;

        const occurred = eventOccurredAt(ev);

        if (ev.type === "user.message") {
          const ts = occurred.getTime();
          if (ts > latestUserMessageTime) latestUserMessageTime = ts;
        }

        if (isTerminalManagedAgentEvent(ev)) {
          const ts = occurred.getTime();
          if (ts > latestTerminalTime) latestTerminalTime = ts;
        }

        const processedAt =
          "processed_at" in ev &&
          typeof (ev as { processed_at?: string | null }).processed_at ===
            "string"
            ? new Date((ev as { processed_at: string }).processed_at)
            : null;

        const result = await db
          .insert(managedAgentEvent)
          .values({
            id: crypto.randomUUID(),
            sessionId: internalSessionId,
            anthropicEventId: aid,
            type: ev.type,
            payload: ev as unknown as Record<string, unknown>,
            processedAt,
            occurredAt: occurred,
          })
          .onConflictDoNothing({
            target: [
              managedAgentEvent.sessionId,
              managedAgentEvent.anthropicEventId,
            ],
          })
          .returning({ id: managedAgentEvent.id });

        if (result.length > 0) {
          insertedAny = true;
          pageAllDuplicates = false;
        }
      }

      if (pageAllDuplicates && items.length > 0) break;
      if (!page.hasNextPage()) break;
      page = await page.getNextPage();
    }

    if (insertedAny) {
      idleCount = 0;
      await db
        .update(managedAgentSession)
        .set({ updatedAt: new Date() })
        .where(eq(managedAgentSession.id, internalSessionId));
    } else {
      idleCount++;
    }

    if (
      insertedAny &&
      latestTerminalTime > 0 &&
      latestUserMessageTime > 0 &&
      latestTerminalTime > latestUserMessageTime
    ) {
      return;
    }

    if (idleCount >= IDLE_POLLS_BEFORE_EXIT && attempt > IDLE_POLLS_BEFORE_EXIT) {
      try {
        const session = await client.beta.sessions.retrieve(anthropicSessionId);
        if (session.status === "running") {
          idleCount = 0;
          continue;
        }
      } catch {}
      return;
    }
  }
}

async function markTailingDone(internalSessionId: string) {
  "use step";

  await db
    .update(managedAgentSession)
    .set({ tailing: false })
    .where(eq(managedAgentSession.id, internalSessionId));
}

export async function tailSessionWorkflow(input: {
  internalSessionId: string;
  anthropicSessionId: string;
}) {
  "use workflow";

  await pollAndPersistStep(input);
  await markTailingDone(input.internalSessionId);
}
