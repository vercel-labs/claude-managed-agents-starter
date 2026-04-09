import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { VercelIcon } from "@/components/icons";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallbackError: "The sign-in request was cancelled or expired. Please try again.",
  OAuthAccountNotLinked: "This email is already associated with another sign-in method.",
  AccessDenied: "You do not have permission to sign in.",
  Configuration: "There is a problem with the server configuration. Contact the administrator.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorCode = params.error ?? "";
  const message =
    ERROR_MESSAGES[errorCode] ??
    (errorCode
      ? `Something went wrong during sign-in (${errorCode}).`
      : "Something went wrong during sign-in.");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Link href="/" aria-label="Home">
        <VercelIcon className="size-6 text-foreground" />
      </Link>

      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>

        <h1 className="text-lg font-medium">Authentication error</h1>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      <Link
        href="/"
        className="flex h-9 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
      >
        Back to home
      </Link>
    </div>
  );
}
