const pending = new Map<string, string>();

export function setPendingMessage(sessionId: string, text: string) {
  pending.set(sessionId, text);
}

export function consumePendingMessage(sessionId: string): string | null {
  const text = pending.get(sessionId) ?? null;
  pending.delete(sessionId);
  return text;
}
