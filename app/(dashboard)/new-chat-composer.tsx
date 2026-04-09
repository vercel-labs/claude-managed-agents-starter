"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, GitBranch, Loader2 } from "lucide-react";
import { SignInModal } from "@/components/sign-in-modal";
import { ConnectGitHubModal } from "@/components/connect-github-modal";
import { GitHubIcon } from "@/components/icons";
import { setPendingMessage } from "@/lib/pending-message";
import { useRepositoryPicker } from "./use-repository-picker";

export function NewChatComposer({
  isAuthenticated = false,
}: {
  isAuthenticated?: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showConnectGithub, setShowConnectGithub] = useState(false);

  const repo = useRepositoryPicker();

  const canSubmit =
    prompt.trim() &&
    !creating &&
    repo.githubConnected === true &&
    repo.selectedRepo &&
    repo.baseBranch;

  const startSession = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    if (repo.githubConnected === false) {
      setShowConnectGithub(true);
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed || !repo.selectedRepo) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/managed-agents/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoOwner: repo.selectedRepo.owner,
          repoName: repo.selectedRepo.name,
          baseBranch: repo.baseBranch,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: string }).error ?? "Failed to create session",
        );
        return;
      }
      const data = (await res.json()) as { id: string };
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
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  }, [isAuthenticated, prompt, router, repo]);

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

  const repoSelector = (() => {
    if (!isAuthenticated) {
      return (
        <button
          type="button"
          onClick={() => setShowSignIn(true)}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
        >
          <GitHubIcon className="size-3" />
          <span>Sign in to select repo</span>
        </button>
      );
    }

    if (repo.githubConnected === null) {
      return (
        <span className="inline-flex h-7 items-center gap-1.5 px-2.5 text-xs text-muted-foreground/50">
          <Loader2 className="size-3 animate-spin" />
          Checking GitHub...
        </span>
      );
    }

    if (repo.githubConnected === false) {
      return (
        <button
          type="button"
          onClick={() => setShowConnectGithub(true)}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-muted-foreground"
        >
          <GitHubIcon className="size-3" />
          <span>Connect GitHub</span>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <select
            value={repo.selectedRepo?.fullName ?? ""}
            onChange={(e) => repo.selectRepo(e.target.value)}
            disabled={repo.reposLoading}
            className="h-7 cursor-pointer appearance-none rounded-full bg-transparent pl-2 pr-6 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none disabled:opacity-50"
          >
            {repo.reposLoading ? (
              <option value="">Loading...</option>
            ) : (
              <>
                <option value="">Select repository</option>
                {repo.repos.map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.fullName}
                  </option>
                ))}
              </>
            )}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
        </div>

        {repo.selectedRepo && (
          <div className="relative">
            <select
              value={repo.baseBranch}
              onChange={(e) => repo.selectBranch(e.target.value)}
              disabled={repo.branchesLoading}
              className="h-7 cursor-pointer appearance-none rounded-full bg-transparent pl-2 pr-6 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none disabled:opacity-50"
            >
              {repo.branchesLoading ? (
                <option value="">Loading...</option>
              ) : (
                repo.branchOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))
              )}
            </select>
            <GitBranch className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="flex h-full items-center justify-center px-4 pt-14 pb-4 md:px-8 md:pt-8 md:pb-8">
      <form onSubmit={onSubmit} className="w-full max-w-3xl space-y-6 md:space-y-8">
        <h1 className="text-center text-2xl font-normal tracking-tight md:text-3xl">
          What do you want to build?
        </h1>

        <div className="rounded-xl border border-border bg-muted/50 shadow-sm">
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a coding task..."
            rows={3}
            disabled={creating}
            className="max-h-[160px] min-h-[72px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {repoSelector}
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={!canSubmit}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-default"
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
          Select a repository and describe a coding task. The agent will clone
          the repo, make changes, and create a pull request.
        </p>
      </form>
      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
      <ConnectGitHubModal
        open={showConnectGithub}
        onOpenChange={setShowConnectGithub}
      />
    </div>
  );
}
