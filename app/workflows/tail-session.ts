import { sleep } from "workflow";
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

async function clearTailingStep(internalSessionId: string) {
  "use step";

  await db
    .update(managedAgentSession)
    .set({ tailing: false })
    .where(eq(managedAgentSession.id, internalSessionId));
}

async function pollSessionEventsStep(input: {
  internalSessionId: string;
  anthropicSessionId: string;
}) {
  "use step";

  const { internalSessionId, anthropicSessionId } = input;
  const client = getAnthropic();

  let page = await client.beta.sessions.events.list(anthropicSessionId, {
    order: "desc",
    limit: 50,
  });

  let sawTerminal = false;
  let insertedAny = false;

  for (;;) {
    const items = page.data ?? [];
    if (items.length === 0) break;

    let pageAllDuplicates = true;

    for (const ev of items as BetaManagedAgentsSessionEvent[]) {
      if (isTerminalManagedAgentEvent(ev)) {
        sawTerminal = true;
      }

      const aid = anthropicEventId(ev);
      if (!aid) continue;

      const occurred = eventOccurredAt(ev);
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

    if (pageAllDuplicates && items.length > 0) {
      break;
    }

    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }

  if (insertedAny) {
    await db
      .update(managedAgentSession)
      .set({ updatedAt: new Date() })
      .where(eq(managedAgentSession.id, internalSessionId));
  }

  return { terminal: sawTerminal };
}

export async function tailSessionWorkflow(input: {
  internalSessionId: string;
  anthropicSessionId: string;
}) {
  "use workflow";

  const { internalSessionId, anthropicSessionId } = input;

  for (;;) {
    const { terminal } = await pollSessionEventsStep({
      internalSessionId,
      anthropicSessionId,
    });

    if (terminal) {
      await clearTailingStep(internalSessionId);
      break;
    }

    await sleep("10s");
  }
}
