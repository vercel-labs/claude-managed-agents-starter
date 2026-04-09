"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { VercelIcon } from "@/components/icons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Link href="/" aria-label="Home">
        <VercelIcon className="size-6 text-foreground" />
      </Link>

      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>

        <h1 className="text-lg font-medium">Something went wrong</h1>

        <p className="text-sm leading-relaxed text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="flex h-9 cursor-pointer items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
