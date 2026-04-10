import type { BetaManagedAgentsSessionEvent } from "@anthropic-ai/sdk/resources/beta/sessions/events";

export function anthropicEventId(
  ev: BetaManagedAgentsSessionEvent,
): string | null {
  if ("id" in ev && typeof (ev as { id?: unknown }).id === "string") {
    return (ev as { id: string }).id;
  }
  return null;
}
