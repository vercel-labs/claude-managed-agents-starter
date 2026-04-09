"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TranscriptEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
};

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "text" &&
      typeof (block as { text?: string }).text === "string"
    ) {
      parts.push((block as { text: string }).text);
    }
  }
  return parts.join("\n");
}

function ToolCallRow({ ev }: { ev: TranscriptEvent }) {
  const [expanded, setExpanded] = useState(false);
  const name =
    typeof ev.payload.name === "string"
      ? ev.payload.name
      : ev.type.replace("agent.", "");

  return (
    <div className="group">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <Wrench className="size-3 shrink-0" />
        <span className="font-medium">{name}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-3 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <pre className="mx-3 mt-1 mb-2 max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(ev.payload.input ?? {}, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TranscriptRow({ ev }: { ev: TranscriptEvent }) {
  const { type, payload } = ev;

  if (type === "user.message") {
    const text = textFromContent(payload.content);
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-foreground px-4 py-2.5 text-background">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {text || "(empty message)"}
          </p>
        </div>
      </div>
    );
  }

  if (type === "agent.message") {
    const text = textFromContent(payload.content);
    return (
      <div className="max-w-[80%]">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {text || "..."}
        </p>
      </div>
    );
  }

  if (type === "session.status_running") {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
        <span className="text-xs text-muted-foreground">Agent is running</span>
      </div>
    );
  }

  if (type === "session.status_idle") {
    const sr = payload.stop_reason as { type?: string } | undefined;
    if (sr?.type === "requires_action") {
      return (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <Badge
            variant="outline"
            className="mb-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400"
          >
            Requires action
          </Badge>
          <p className="text-xs text-muted-foreground">
            This session needs confirmation in the Claude console before the
            agent can continue.
          </p>
        </div>
      );
    }
    return null;
  }

  if (
    type === "agent.tool_use" ||
    type === "agent.mcp_tool_use" ||
    type === "agent.custom_tool_use"
  ) {
    return <ToolCallRow ev={ev} />;
  }

  if (type === "agent.thinking") {
    return (
      <div className="flex items-center gap-2 py-1">
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
        <span className="text-xs italic text-muted-foreground">Thinking</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <p className="font-mono text-[10px] text-muted-foreground">{type}</p>
      <pre className="mt-1 max-h-40 overflow-auto text-[11px]">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [tailing, setTailing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/managed-agents/transcript?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to load");
      }
      const data = (await res.json()) as {
        events: TranscriptEvent[];
        tailing: boolean;
      };
      setEvents(data.events);
      setTailing(data.tailing);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transcript");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    const intervalMs = tailing ? 2_500 : 5_000;
    const id = setInterval(() => void poll(), intervalMs);
    return () => clearInterval(id);
  }, [poll, tailing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, tailing]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/managed-agents/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Send failed");
      }
      setText("");
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  const hasContent = events.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-sm font-medium">Session</h1>
        {tailing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            syncing
          </span>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="flex flex-col gap-4">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading transcript
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && !hasContent && !error && (
              <p className="text-center text-sm text-muted-foreground">
                No messages yet. Send a message to start the managed agent.
              </p>
            )}
            {events.map((ev) => (
              <TranscriptRow key={ev.id} ev={ev} />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Message the agent..."
              rows={1}
              disabled={sending}
              className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
              style={{
                height: "auto",
                overflow: "hidden",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                el.style.overflow =
                  el.scrollHeight > 200 ? "auto" : "hidden";
              }}
            />
            <div className="flex items-center justify-end px-3 py-2">
              <button
                type="button"
                aria-label="Send message"
                onClick={() => void handleSend()}
                disabled={sending || !text.trim()}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-default"
              >
                {sending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
