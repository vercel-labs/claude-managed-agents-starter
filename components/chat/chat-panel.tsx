"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronRight, Loader2, PanelLeft } from "lucide-react";
import { Streamdown, type Components } from "streamdown";
import { cn } from "@/lib/utils";
import { consumePendingMessage } from "@/lib/pending-message";
import { useSidebar } from "@/lib/sidebar-context";
import { Button } from "@/components/ui/button";

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
  return parts.join("");
}

/* ---------- Markdown ---------- */

const streamdownComponents: Components = {
  p: ({ children, ...props }) => (
    <div {...props} className="mb-4 last:mb-0">
      {children}
    </div>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="mb-4 list-decimal space-y-2 pl-6 last:mb-0">
      {children}
    </ol>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="mb-4 list-disc space-y-1.5 pl-6 last:mb-0">
      {children}
    </ul>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="pl-1">
      {children}
    </li>
  ),
  pre: ({ children, ...props }) => (
    <pre {...props} className="mb-4 overflow-x-auto rounded-lg bg-muted/50 p-4 font-mono text-sm last:mb-0">
      {children}
    </pre>
  ),
  code: ({ children, ...props }) => (
    <code {...props} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  ),
};

function Markdown({ text }: { text: string }) {
  return (
    <Streamdown components={streamdownComponents} linkSafety={{ enabled: false }}>
      {text}
    </Streamdown>
  );
}

/* ---------- Tool categorization ---------- */

function resolveToolName(ev: TranscriptEvent): string {
  const name = typeof ev.payload.name === "string" ? ev.payload.name : "";
  if (name) return name.toLowerCase();
  return ev.type.replace("agent.", "").toLowerCase() || "tool";
}

function mcpServerFromName(name: string): string | null {
  if (name.startsWith("notion__") || name.startsWith("notion_")) return "notion";
  if (name.startsWith("github__") || name.startsWith("github_")) return "github";
  if (name.startsWith("slack__") || name.startsWith("slack_")) return "slack";
  return null;
}

function toolCategory(name: string): string {
  const server = mcpServerFromName(name);
  if (server) return server;
  switch (name) {
    case "bash":
    case "shell":
      return "ran";
    case "edit":
      return "edited";
    case "write":
      return "wrote";
    case "read":
      return "read";
    case "grep":
    case "rg":
    case "glob":
    case "list":
    case "web_search":
      return "searched";
    case "webfetch":
    case "web_fetch":
      return "fetched";
    case "task":
      return "other";
    default:
      return "other";
  }
}

function summarizeToolGroup(tools: TranscriptEvent[]): string {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const cat = toolCategory(resolveToolName(tool));
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const order: [string, string, string, string][] = [
    ["notion", "Used Notion", "time", "times"],
    ["github", "Used GitHub", "time", "times"],
    ["slack", "Used Slack", "time", "times"],
    ["ran", "Ran", "command", "commands"],
    ["edited", "Edited", "file", "files"],
    ["wrote", "Wrote", "file", "files"],
    ["read", "Read", "file", "files"],
    ["searched", "Searched", "pattern", "patterns"],
    ["fetched", "Fetched", "URL", "URLs"],
    ["other", "Ran", "action", "actions"],
  ];

  const parts: string[] = [];
  for (const [key, verb, singular, plural] of order) {
    const n = counts.get(key);
    if (!n) continue;
    parts.push(n === 1 ? verb : `${verb} ${n} ${plural}`);
  }

  return parts.join(", ") || `${tools.length} tool calls`;
}

function humanToolName(name: string): string {
  const server = mcpServerFromName(name);
  if (server) return name.replace(/^[^_]+__?/, "");
  return name;
}

function describeToolAction(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (name === "bash" || name === "shell") {
    const cmd = typeof obj.command === "string" ? obj.command : "";
    return cmd.length > 60 ? cmd.slice(0, 60) + "..." : cmd;
  }
  if (name === "read" || name === "write" || name === "edit") {
    return typeof obj.path === "string" ? obj.path : typeof obj.file_path === "string" ? obj.file_path : "";
  }
  if (name === "grep" || name === "rg") {
    return typeof obj.pattern === "string" ? obj.pattern : "";
  }
  const server = mcpServerFromName(name);
  if (server) {
    const action = name.replace(/^[^_]+__?/, "").replace(/_/g, " ");
    return action || "";
  }
  return "";
}

function ToolCallItem({ ev }: { ev: TranscriptEvent }) {
  const [expanded, setExpanded] = useState(false);
  const rawName = resolveToolName(ev);
  const input = ev.payload.input;
  const displayName = humanToolName(rawName);
  const label = describeToolAction(rawName, input);
  const hasDetail = Boolean(input && typeof input === "object" && Object.keys(input as object).length > 0);

  return (
    <div className="py-0.5">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 py-0.5 text-left text-xs text-muted-foreground transition-colors",
          hasDetail ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <Check className="size-3 shrink-0 text-muted-foreground" />
        <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
          {displayName}
        </span>
        {label && <span className="truncate text-foreground/80">{label}</span>}
        {hasDetail && (
          <ChevronRight className={cn("ml-auto size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
        )}
      </button>
      {expanded && (
        <pre className="ml-5 mt-1 mb-1 max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolGroup({ tools }: { tools: TranscriptEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const label = summarizeToolGroup(tools);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex cursor-pointer items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{label}</span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-all",
            expanded ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      </button>
      {expanded && (
        <div className="ml-1.5 border-l border-border/40 pl-2 pt-0.5 pb-1">
          {tools.map((ev) => (
            <ToolCallItem key={ev.id} ev={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Transcript renderer (flush-based, merges tools between user messages) ---------- */

type EventGroup =
  | { kind: "event"; event: TranscriptEvent }
  | { kind: "tools"; events: TranscriptEvent[] };

function TranscriptRenderer({ grouped }: { grouped: EventGroup[] }) {
  return (
    <div className="flex flex-col gap-4">
      {grouped.map((group, idx) => {
        if (group.kind === "tools") {
          return <ToolGroup key={`tg-${idx}`} tools={group.events} />;
        }
        const ev = group.event;
        const { type, payload } = ev;

        if (type === "user.message") {
          const msg = textFromContent(payload.content);
          return (
            <div key={ev.id} className="flex justify-end">
              <div className="max-w-[80%]">
                <div className="rounded-2xl bg-muted/70 px-4 py-2.5 text-[15px] leading-relaxed">
                  <div className="whitespace-pre-wrap">{msg || "(empty)"}</div>
                </div>
              </div>
            </div>
          );
        }

        if (type === "agent.message") {
          const msg = textFromContent(payload.content);
          if (!msg) return null;
          return (
            <div key={ev.id} className="max-w-none overflow-x-auto text-[15px] leading-relaxed text-foreground/85">
              <Markdown text={msg} />
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
    </div>
  );
}

/* ---------- Skeleton ---------- */

function ChatSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      <div className="flex justify-end">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted/30" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/25" />
      </div>
      <div className="h-3 w-36 animate-pulse rounded bg-muted/20" />
      <div className="space-y-2">
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/25" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/25" />
      </div>
    </div>
  );
}

/* ---------- Event grouping ---------- */

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

function hasMoreToolsAhead(events: TranscriptEvent[], fromIndex: number): boolean {
  for (let j = fromIndex; j < events.length; j++) {
    const t = events[j].type;
    if (TOOL_TYPES.has(t)) return true;
    if (t === "user.message") return false;
    if (t === "session.status_idle") return false;
  }
  return false;
}

function groupEvents(events: TranscriptEvent[]) {
  const visible = events.filter((ev) => !HIDDEN_TYPES.has(ev.type));
  const groups: EventGroup[] = [];
  let pendingTools: TranscriptEvent[] = [];

  const flushTools = () => {
    if (pendingTools.length === 0) return;
    groups.push({ kind: "tools", events: pendingTools });
    pendingTools = [];
  };

  for (let i = 0; i < visible.length; i++) {
    const ev = visible[i];

    if (TOOL_TYPES.has(ev.type)) {
      pendingTools.push(ev);
      continue;
    }

    if (ev.type === "user.message") {
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    if (ev.type === "agent.message") {
      const msg = textFromContent(ev.payload.content);
      if (!msg) continue;
      if (pendingTools.length > 0 && hasMoreToolsAhead(visible, i + 1)) {
        continue;
      }
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    if (ev.type === "session.status_idle") {
      const sr = ev.payload.stop_reason as { type?: string } | undefined;
      if (sr?.type !== "requires_action") continue;
      flushTools();
      groups.push({ kind: "event", event: ev });
      continue;
    }

    groups.push({ kind: "event", event: ev });
  }

  flushTools();
  return groups;
}

/* ---------- Main panel ---------- */

export function ChatPanel({ sessionId }: { sessionId: string }) {
  const sidebar = useSidebar();
  const [pending] = useState(() => consumePendingMessage(sessionId));
  const [events, setEvents] = useState<TranscriptEvent[]>(() => {
    if (!pending) return [];
    return [
      {
        id: "optimistic-initial",
        type: "user.message",
        payload: { content: [{ type: "text", text: pending }] },
        occurredAt: new Date().toISOString(),
      },
    ];
  });
  const [tailing, setTailing] = useState(!!pending);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIdsRef = useRef(new Set<string>());

  function connectToStream(runId: string) {
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/readable/${runId}`);
    eventSourceRef.current = es;
    setTailing(true);

    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as TranscriptEvent;
        if (seenIdsRef.current.has(ev.id)) return;
        seenIdsRef.current.add(ev.id);

        setEvents((prev) => {
          if (prev.some((e) => e.id === ev.id)) return prev;

          const withoutOptimistic =
            ev.type === "user.message"
              ? prev.filter((e) => {
                  if (!e.id.startsWith("optimistic-")) return true;
                  return (
                    textFromContent(e.payload.content) !==
                    textFromContent(ev.payload.content)
                  );
                })
              : prev;
          return [...withoutOptimistic, ev];
        });
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setTailing(false);
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(
          `/api/managed-agents/transcript?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? "Failed to load",
          );
        }
        const data = (await res.json()) as {
          title: string | null;
          tailing: boolean;
          workflowRunId: string | null;
        };
        if (cancelled) return;

        setTitle(data.title);

        if (data.workflowRunId) {
          connectToStream(data.workflowRunId);
        } else {
          setTailing(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load transcript",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
    };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, tailing, sending]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setTailing(true);
    setError(null);

    const optimisticId = `optimistic-${Date.now()}`;
    setEvents((prev) => [
      ...prev,
      {
        id: optimisticId,
        type: "user.message",
        payload: { content: [{ type: "text", text: trimmed }] },
        occurredAt: new Date().toISOString(),
      },
    ]);
    setText("");

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
      const data = (await res.json()) as { ok: boolean; runId?: string };
      if (data.runId) {
        connectToStream(data.runId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      setTailing(false);
      setEvents((prev) => prev.filter((ev) => ev.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  const grouped = groupEvents(events);

  const lastUserIdx = events.findLastIndex((e) => e.type === "user.message");
  const agentDoneAfterLastMsg = lastUserIdx >= 0 && events.slice(lastUserIdx + 1).some((ev) => {
    if (ev.type === "session.status_terminated" || ev.type === "session.deleted") return true;
    if (ev.type === "session.status_idle") {
      const sr = (ev.payload as { stop_reason?: { type?: string } }).stop_reason;
      return sr?.type === "end_turn" || sr?.type === "retries_exhausted";
    }
    return false;
  });

  const showThinking = !agentDoneAfterLastMsg && (tailing || sending) && lastUserIdx >= 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/50 py-3 px-4 md:px-6">
          {!sidebar.open && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden shrink-0 md:flex"
              onClick={sidebar.toggle}
              aria-label="Open sidebar"
            >
              <PanelLeft className="size-4" />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-5 w-48 animate-pulse rounded bg-muted/40" />
            ) : (
              <h1 className="truncate text-sm font-medium text-muted-foreground">
                {title && title !== "New chat" ? title : "New question"}
              </h1>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && !pending ? (
            <ChatSkeleton />
          ) : (
            <div className="mx-auto max-w-3xl space-y-2 pb-40">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}
              <TranscriptRenderer grouped={grouped} />
              {showThinking && (
                <div className="pt-3" role="status" aria-live="polite">
                  <div className="py-1 text-sm font-medium shimmer-text">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background from-55% to-transparent px-4 pb-4 pt-10">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <div className="rounded-2xl border border-border/60 bg-background/95 shadow-lg backdrop-blur transition-shadow focus-within:border-border focus-within:shadow-xl">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Explore a topic..."
                rows={1}
                disabled={sending || showThinking}
                className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-5 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                style={{ height: "auto", overflow: "hidden" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                  el.style.overflow = el.scrollHeight > 200 ? "auto" : "hidden";
                }}
              />
              <div className="flex items-center justify-end px-4 py-2.5">
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={() => void handleSend()}
                  disabled={sending || !text.trim()}
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
