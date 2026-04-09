"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInModal } from "@/components/sign-in-modal";
import { ArrowUp, ChevronDown, Loader2 } from "lucide-react";
import { GitHubIcon, NotionIcon, SlackIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { setPendingMessage } from "@/lib/pending-message";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export function NewChatComposer({
  isAuthenticated = true,
  mcpConnections = {},
}: {
  isAuthenticated?: boolean;
  mcpConnections?: Record<string, boolean>;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [mcpState, setMcpState] = useState<Record<string, boolean>>({
    github: true,
    notion: true,
    slack: true,
  });
  const toggleMcp = useCallback((name: string, enabled: boolean) => {
    setMcpState((prev) => ({ ...prev, [name]: enabled }));
  }, []);

  const startSession = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    if (!prompt.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/managed-agents/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: string }).error ?? "Failed to create session",
        );
        return;
      }
      const data = (await res.json()) as { id: string };
      const trimmed = prompt.trim();
      const msgRes = await fetch("/api/managed-agents/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: data.id, text: trimmed }),
      });
      if (!msgRes.ok) {
        const body = await msgRes.json().catch(() => ({}));
        setError(
          (body as { error?: string }).error ?? "Failed to send message",
        );
        return;
      }
      setPrompt("");
      setPendingMessage(data.id, trimmed);
      router.push(`/chat/${data.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create session",
      );
    } finally {
      setCreating(false);
    }
  }, [isAuthenticated, prompt, router]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void startSession();
      }
    },
    [startSession],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void startSession();
    },
    [startSession],
  );

  return (
    <div className="flex h-full items-center justify-center px-4 pt-14 pb-4 md:px-8 md:pt-8 md:pb-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-3xl space-y-4"
      >
        <h1 className="mb-2 text-center text-2xl font-normal tracking-tight md:text-3xl">
          What do you want to build?
        </h1>

        <div className="rounded-xl border border-border bg-muted/50 shadow-sm">
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a task..."
            rows={4}
            disabled={creating}
            className="max-h-[200px] min-h-[100px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <IntegrationsDropdown
                mcpState={mcpState}
                mcpConnections={mcpConnections}
                onToggle={toggleMcp}
                onLogin={(serverName) => {
                  window.location.href = `/api/mcp-auth/${serverName}`;
                }}
                onLogout={async (serverName) => {
                  await fetch(`/api/mcp-auth/${serverName}`, {
                    method: "DELETE",
                  });
                  window.location.reload();
                }}
              />
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!prompt.trim() || creating}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
            >
              {creating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ArrowUp className="size-3.5" />
              )}
            </button>
          </div>
        </div>

        {error && <p className="px-1 text-sm text-destructive">{error}</p>}

        <p className="mx-auto max-w-lg text-center text-xs text-muted-foreground">
          Describe a task. The agent can read and modify GitHub repos,
          search Notion, message on Slack, and more.
        </p>
      </form>
      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
    </div>
  );
}

interface IntegrationDef {
  name: string;
  label: string;
  icon: React.ReactNode;
}

const INTEGRATIONS: IntegrationDef[] = [
  { name: "github", label: "GitHub", icon: <GitHubIcon className="size-4" /> },
  { name: "slack", label: "Slack", icon: <SlackIcon className="size-4" /> },
  { name: "notion", label: "Notion", icon: <NotionIcon className="size-4" /> },
];

function IntegrationsDropdown({
  mcpState,
  mcpConnections,
  onToggle,
  onLogin,
  onLogout,
}: {
  mcpState: Record<string, boolean>;
  mcpConnections: Record<string, boolean>;
  onToggle: (name: string, enabled: boolean) => void;
  onLogin: (serverName: string) => void;
  onLogout: (serverName: string) => void;
}) {
  const enabledIcons = INTEGRATIONS.filter(
    (s) => mcpState[s.name] && mcpConnections[s.name],
  );

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        {enabledIcons.length > 0 ? (
          <span className="flex items-center gap-1.5">
            {enabledIcons.map((s) => (
              <span
                key={s.name}
                className="inline-flex size-3.5 [&>svg]:size-3.5"
              >
                {s.icon}
              </span>
            ))}
          </span>
        ) : (
          <span>Integrations</span>
        )}
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-0">
        <div className="py-1">
          {INTEGRATIONS.map((server) => {
            const connected = mcpConnections[server.name] ?? false;
            const enabled = mcpState[server.name] ?? false;
            return (
              <IntegrationRow
                key={server.name}
                server={server}
                connected={connected}
                enabled={enabled}
                onToggle={onToggle}
                onLogin={onLogin}
                onLogout={onLogout}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IntegrationRow({
  server,
  connected,
  enabled,
  onToggle,
  onLogin,
  onLogout,
}: {
  server: IntegrationDef;
  connected: boolean;
  enabled: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  onLogin: (serverName: string) => void;
  onLogout: (serverName: string) => void;
}) {
  return (
    <div className="group/row flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/60">
          {server.icon}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-background",
              connected && enabled
                ? "bg-emerald-500"
                : connected
                  ? "bg-muted-foreground/40"
                  : "bg-muted-foreground/20",
            )}
          />
        </div>
        <span className="text-sm">{server.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {connected ? (
          <>
            <button
              type="button"
              onClick={() => onLogout(server.name)}
              className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground/0 ring-0 ring-border transition-all group-hover/row:text-muted-foreground group-hover/row:ring-1 hover:bg-muted! hover:text-foreground!"
            >
              Logout
            </button>
            <Switch
              checked={enabled}
              onCheckedChange={(v: boolean) => onToggle(server.name, v)}
              size="sm"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => onLogin(server.name)}
            className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
          >
            Login
          </button>
        )}
      </div>
    </div>
  );
}
