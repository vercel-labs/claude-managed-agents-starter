"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Loader2 } from "lucide-react";
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

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <div key={elements.length} className="my-3 rounded-lg border border-border bg-muted/50 overflow-hidden">
          {lang && (
            <div className="border-b border-border px-4 py-1.5 text-[11px] text-muted-foreground">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={elements.length} className="h-3" />);
      i++;
      continue;
    }

    elements.push(
      <p key={elements.length} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>,
    );
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      nodes.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[4]) {
      nodes.push(
        <code key={match.index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function ToolGroup({ tools }: { tools: TranscriptEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const count = tools.length;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>Ran {count} action{count !== 1 ? "s" : ""}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 border-l-2 border-border pl-3">
          {tools.map((ev) => {
            const name =
              typeof ev.payload.name === "string"
                ? ev.payload.name
                : ev.type.replace("agent.", "");
            return (
              <div key={ev.id} className="flex items-center gap-2 py-0.5">
                <Check className="size-3.5 text-emerald-500" />
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  task
                </span>
                <span className="text-sm">{name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HIDDEN_TYPES = new Set([
  "span.model_request_start",
  "span.model_request_end",
  "agent.tool_result",
  "session.status_terminated",
  "session.status_running",
  "session.deleted",
  "agent.thinking",
]);

const TOOL_TYPES = new Set([
  "agent.tool_use",
  "agent.mcp_tool_use",
  "agent.custom_tool_use",
]);

function groupEvents(events: TranscriptEvent[]) {
  const groups: Array<
    | { kind: "event"; event: TranscriptEvent }
    | { kind: "tools"; events: TranscriptEvent[] }
  > = [];

  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if (HIDDEN_TYPES.has(ev.type)) {
      i++;
      continue;
    }
    if (TOOL_TYPES.has(ev.type)) {
      const tools: TranscriptEvent[] = [ev];
      i++;
      while (i < events.length) {
        const next = events[i];
        if (TOOL_TYPES.has(next.type)) {
          tools.push(next);
          i++;
        } else if (HIDDEN_TYPES.has(next.type)) {
          i++;
        } else {
          break;
        }
      }
      groups.push({ kind: "tools", events: tools });
      continue;
    }
    if (ev.type === "session.status_idle") {
      const sr = ev.payload.stop_reason as { type?: string } | undefined;
      if (sr?.type !== "requires_action") {
        i++;
        continue;
      }
    }
    groups.push({ kind: "event", event: ev });
    i++;
  }
  return groups;
}

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [tailing, setTailing] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
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
        title: string | null;
        events: TranscriptEvent[];
        tailing: boolean;
      };
      setEvents(data.events);
      setTailing(data.tailing);
      setTitle(data.title);
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

  const grouped = groupEvents(events);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center border-b border-border px-6 py-3">
        <h1 className="text-sm font-semibold">
          {title && title !== "New chat" ? title : "New Session"}
        </h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <div className="flex flex-col gap-5">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {grouped.map((group, idx) => {
              if (group.kind === "tools") {
                return <ToolGroup key={idx} tools={group.events} />;
              }
              const ev = group.event;
              const { type, payload } = ev;

              if (type === "user.message") {
                const msg = textFromContent(payload.content);
                return (
                  <div key={ev.id} className="flex items-start justify-end gap-3">
                    <div className="rounded-2xl bg-foreground/90 px-4 py-2.5 text-background">
                      <p className="text-sm">{msg || "(empty)"}</p>
                    </div>
                  </div>
                );
              }

              if (type === "agent.message") {
                const msg = textFromContent(payload.content);
                if (!msg) return null;
                return (
                  <div key={ev.id}>
                    <SimpleMarkdown text={msg} />
                  </div>
                );
              }

              if (type === "session.status_idle") {
                return (
                  <div key={ev.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                    <p className="text-xs font-medium text-amber-500">Requires action</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This session needs confirmation in the Anthropic console.
                    </p>
                  </div>
                );
              }

              return null;
            })}
            {tailing && (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

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
              style={{ height: "auto", overflow: "hidden" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                el.style.overflow = el.scrollHeight > 200 ? "auto" : "hidden";
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
