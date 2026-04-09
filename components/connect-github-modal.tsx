"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { GitHubIcon } from "@/components/icons";

export function ConnectGitHubModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border border-border bg-muted">
            <GitHubIcon className="size-4" />
          </div>
          <DialogTitle>Connect GitHub</DialogTitle>
          <DialogDescription>
            Link your GitHub account to access your repositories and start
            coding sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          <button
            onClick={async () => {
              await authClient.linkSocial({ provider: "github" });
            }}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <GitHubIcon className="size-3.5" />
            Connect GitHub
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
