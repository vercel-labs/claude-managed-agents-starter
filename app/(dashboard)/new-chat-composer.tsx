"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInModal } from "@/components/sign-in-modal";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  Code,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { GitHubIcon, NotionIcon, SlackIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { setPendingMessage } from "@/lib/pending-message";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HEADING_PROMPTS = [
  "Ask about a company process",
  "Find context across your tools",
  "Look up a recent decision",
  "Understand a codebase change",
  "Search your team knowledge",
];

const SUGGESTION_PILLS = [
  { label: "Research", prompt: "Research the latest decisions around our migration plan", icon: <Search className="size-3.5" /> },
  { label: "Summarize", prompt: "Summarize last week's engineering updates across all channels", icon: <FileText className="size-3.5" /> },
  { label: "Explain code", prompt: "Explain how authentication works in our main API repo", icon: <Code className="size-3.5" /> },
  { label: "Find docs", prompt: "Find the onboarding documentation for new hires", icon: <BookOpen className="size-3.5" /> },
  { label: "Draft", prompt: "Draft a project kickoff message for a new feature", icon: <Sparkles className="size-3.5" /> },
  { label: "Catch up", prompt: "What's been happening in the product channel this week?", icon: <Zap className="size-3.5" /> },
];

export function NewChatComposer({
  isAuthenticated = true,
  mcpConnections = {},
}: {
  isAuthenticated?: boolean;
  mcpConnections?: Record<string, boolean>;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [headingIndex, setHeadingIndex] = useState(0);
  const [mcpState, setMcpState] = useState<Record<string, boolean>>(() => ({
    github: !!mcpConnections.github,
    notion: !!mcpConnections.notion,
    slack: !!mcpConnections.slack,
  }));
  const toggleMcp = useCallback((name: string, enabled: boolean) => {
    setMcpState((prev) => ({ ...prev, [name]: enabled }));
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setHeadingIndex((i) => (i + 1) % HEADING_PROMPTS.length),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  const startSession = useCallback(
    async (text?: string) => {
      const message = text ?? prompt;
      if (!isAuthenticated) {
        setShowSignIn(true);
        return;
      }
      if (!message.trim()) return;
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
        const trimmed = message.trim();
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
    },
    [isAuthenticated, prompt, router],
  );

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
    <div className="relative flex h-full items-center justify-center px-4 pb-4 md:px-8 md:pb-8">
      <form onSubmit={onSubmit} className="w-full max-w-2xl space-y-5">
        <h1
          key={headingIndex}
          className="animate-in fade-in slide-in-from-bottom-2 mb-6 text-center text-2xl font-medium tracking-tight duration-500 md:text-3xl"
        >
          {HEADING_PROMPTS[headingIndex]}
        </h1>

        <div className="rounded-2xl border border-border bg-muted/30 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-1 focus-within:ring-primary/20">
          <textarea
            ref={textareaRef}
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Explore a topic..."
            rows={2}
            disabled={creating}
            className="max-h-[160px] min-h-[72px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
          />

          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <IntegrationsDropdown
                mcpState={mcpState}
                mcpConnections={mcpConnections}
                onToggle={toggleMcp}
                onLogin={(serverName) => {
                  if (serverName === "slack") {
                    setShowSlackSetup(true);
                  } else {
                    window.location.href = `/api/mcp-auth/${serverName}`;
                  }
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
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>

        {error && <p className="px-1 text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUGGESTION_PILLS.map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={() => {
                setPrompt(pill.prompt);
                textareaRef.current?.focus();
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
            >
              {pill.icon}
              {pill.label}
            </button>
          ))}
        </div>
      </form>

      <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground/40">
        <a
          href="https://vercel.com"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-muted-foreground"
        >
          Vercel
        </a>
        {" + "}
        <a
          href="https://platform.claude.com/docs/en/managed-agents/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-muted-foreground"
        >
          Claude Managed Agents
        </a>
        {" "}&middot;{" "}
        <a
          href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents&project-name=claude-managed-agents&repository-name=claude-managed-agents&env=ANTHROPIC_API_KEY%2CANTHROPIC_AGENT_ID%2CANTHROPIC_ENVIRONMENT_ID%2CBETTER_AUTH_SECRET%2CVERCEL_CLIENT_ID%2CVERCEL_CLIENT_SECRET%2CTOKEN_ENCRYPTION_KEY&envDescription=Configure+your+Anthropic+agent+and+Vercel+OAuth+credentials.&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents%23local-setup&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%5D&demo-title=Internal+Knowledge+Agent&demo-description=An+internal+knowledge+assistant+powered+by+Claude+Managed+Agents.+Connect+GitHub%2C+Notion%2C+and+Slack+via+MCP+to+search+across+your+tools."
          target="_blank"
          rel="noopener noreferrer"
          className="underline transition-colors hover:text-muted-foreground"
        >
          Deploy your own
        </a>
      </p>

      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
      <SlackSetupModal
        open={showSlackSetup}
        onOpenChange={setShowSlackSetup}
      />
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

function SlackSetupModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border bg-muted">
            <SlackIcon className="size-5" />
          </div>
          <DialogTitle>Slack requires setup</DialogTitle>
          <DialogDescription>
            Slack integration requires a Slack app with OAuth credentials. Clone
            this template and deploy with your own Slack app ID and secret to
            search your team conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2">
          <a
            href="https://github.com/vercel-labs/claude-managed-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <GitHubIcon className="size-3.5" />
            Clone template
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://api.slack.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted"
          >
            Create a Slack app
            <ExternalLink className="size-3" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
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
  function handleToggle(checked: boolean) {
    onToggle(server.name, checked);
    if (checked && !connected) {
      onLogin(server.name);
    }
  }

  return (
    <div className="group/row flex items-center justify-between px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="relative flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted/60">
          {server.icon}
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-background",
              connected && enabled
                ? "bg-primary"
                : connected
                  ? "bg-muted-foreground/40"
                  : "bg-muted-foreground/20",
            )}
          />
        </div>
        <span className="text-sm">{server.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {enabled && !connected && (
          <button
            type="button"
            onClick={() => onLogin(server.name)}
            className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground"
          >
            Login
          </button>
        )}
        {connected && (
          <button
            type="button"
            onClick={() => onLogout(server.name)}
            className="cursor-pointer rounded px-2 py-0.5 text-xs text-muted-foreground/0 ring-0 ring-border transition-all group-hover/row:text-muted-foreground group-hover/row:ring-1 hover:bg-muted! hover:text-foreground!"
          >
            Logout
          </button>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          size="sm"
        />
      </div>
    </div>
  );
}
