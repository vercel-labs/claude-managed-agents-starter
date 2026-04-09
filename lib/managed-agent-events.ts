import type { BetaManagedAgentsSessionEvent } from "@anthropic-ai/sdk/resources/beta/sessions/events";

export function anthropicEventId(
  ev: BetaManagedAgentsSessionEvent,
): string | null {
  if ("id" in ev && typeof (ev as { id?: unknown }).id === "string") {
    return (ev as { id: string }).id;
  }
  return null;
}

export function isTerminalManagedAgentEvent(
  ev: BetaManagedAgentsSessionEvent,
): boolean {
  if (
    ev.type === "session.status_terminated" ||
    ev.type === "session.deleted" ||
    ev.type === "session.error"
  ) {
    return true;
  }
  if (ev.type === "session.status_idle") {
    const t = ev.stop_reason.type;
    return (
      t === "end_turn" ||
      t === "requires_action" ||
      t === "retries_exhausted"
    );
  }
  return false;
}

export function eventOccurredAt(ev: BetaManagedAgentsSessionEvent): Date {
  if (
    "processed_at" in ev &&
    typeof (ev as { processed_at?: string | null }).processed_at === "string"
  ) {
    return new Date((ev as { processed_at: string }).processed_at);
  }
  return new Date();
}
