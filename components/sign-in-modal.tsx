"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { VercelIcon } from "@/components/icons";

export function SignInModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleVercelSignIn() {
    setError("");
    setLoading(true);
    try {
      await authClient.signIn.oauth2({
        providerId: "vercel",
        callbackURL: "/",
      });
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border bg-muted">
            <VercelIcon className="size-4" />
          </div>
          <DialogTitle>Sign in to get started</DialogTitle>
          <DialogDescription>
            Connect your Vercel account to search across your internal
            knowledge base.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          {error && (
            <p className="text-center text-sm text-destructive">{error}</p>
          )}
          <button
            onClick={handleVercelSignIn}
            disabled={loading}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <VercelIcon className="size-3.5" />
            {loading ? "Redirecting..." : "Continue with Vercel"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
