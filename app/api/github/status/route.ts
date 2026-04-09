import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGitHubIdentityForUser } from "@/lib/get-github-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const identity = await getGitHubIdentityForUser(authz.userId);
  if (!identity) {
    return NextResponse.json({ connected: false, login: null });
  }

  return NextResponse.json({ connected: true, login: identity.login });
}
