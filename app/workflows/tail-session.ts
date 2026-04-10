import { defineHook, sleep, getWritable } from "workflow";
import { getAnthropic } from "@/lib/anthropic";
import { anthropicEventId } from "@/lib/managed-agent-events";

const MAX_POLLS_PER_TURN = 200;
const POLL_INTERVAL = "3s";

export type SessionEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export const messageHook = defineHook<{ text: string }>();

async function sendMessage(
  anthropicSessionId: string,
  text: string,
): Promise<void> {
  "use step";
  console.log(`[sendMessage] session=${anthropicSessionId} text=${text.slice(0, 60)}`);

  const client = getAnthropic();
  await client.beta.sessions.events.send(anthropicSessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });

  console.log(`[sendMessage] DONE`);
}

async function pollAndStream(input: {
  anthropicSessionId: string;
  lastEventId: string | null;
}): Promise<{ lastEventId: string | null; done: boolean }> {
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

    let seenLast = input.lastEventId === null;
    for (const event of page.data) {
      const aid = anthropicEventId(event);
      if (!aid) continue;

      if (!seenLast) {
        if (aid === input.lastEventId) seenLast = true;
        continue;
      }

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

      if (
        event.type === "session.status_idle" ||
        event.type === "session.status_terminated" ||
        event.type === "session.deleted"
      ) {
        done = true;
        break;
      }
    }
  } finally {
    writer.releaseLock();
  }

  console.log(`[pollAndStream] DONE wrote=${written} lastId=${lastId} done=${done}`);
  return { lastEventId: lastId, done };
}

async function processTurn(
  anthropicSessionId: string,
  text: string,
  lastEventId: string | null,
): Promise<string | null> {
  await sendMessage(anthropicSessionId, text);

  let currentLastEventId = lastEventId;
  for (let i = 0; i < MAX_POLLS_PER_TURN; i++) {
    await sleep(POLL_INTERVAL);

    const result = await pollAndStream({
      anthropicSessionId,
      lastEventId: currentLastEventId,
    });

    currentLastEventId = result.lastEventId;

    if (result.done) {
      console.log(`[sessionWorkflow] turn complete after ${i + 1} polls`);
      break;
    }
  }
  return currentLastEventId;
}

export async function sessionWorkflow(input: {
  internalSessionId: string;
  anthropicSessionId: string;
  initialMessage: string;
}) {
  "use workflow";
  console.log(`[sessionWorkflow] START internal=${input.internalSessionId} anthropic=${input.anthropicSessionId}`);

  let lastEventId: string | null = null;

  lastEventId = await processTurn(
    input.anthropicSessionId,
    input.initialMessage,
    lastEventId,
  );

  const hook = messageHook.create({
    token: `msg:${input.internalSessionId}`,
  });

  for await (const { text } of hook) {
    console.log(`[sessionWorkflow] received message: ${text.slice(0, 60)}`);
    lastEventId = await processTurn(
      input.anthropicSessionId,
      text,
      lastEventId,
    );
  }
}
