"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2 } from "lucide-react";
import { SignInModal } from "@/components/sign-in-modal";
import { setPendingMessage } from "@/lib/pending-message";

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

  const startSession = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSignIn(true);
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/managed-agents/session", {
        method: "POST",
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
      <form onSubmit={onSubmit} className="w-full max-w-3xl space-y-6 md:space-y-8">
        <h1 className="text-center text-2xl font-normal tracking-tight md:text-3xl">
          What do you want Claude to do?
        </h1>

        <div className="rounded-xl border border-border bg-muted/50 shadow-sm">
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a task for the managed agent..."
            rows={3}
            disabled={creating}
            className="max-h-[160px] min-h-[72px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="flex items-center justify-end px-3 py-2">
            <button
              type="submit"
              aria-label="Send message"
              disabled={!prompt.trim() || creating}
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
          Send a task to the Claude Managed Agents API. The agent runs
          server-side and results are polled back to this UI.
        </p>
      </form>
      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
    </div>
  );
}
