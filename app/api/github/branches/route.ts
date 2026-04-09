import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGithubTokenForUser } from "@/lib/get-github-token";
import { orderBranchOptions } from "@/lib/branches";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const owner = request.nextUrl.searchParams.get("owner");
  const repo = request.nextUrl.searchParams.get("repo");
  const defaultBranch = request.nextUrl.searchParams.get("defaultBranch");
  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }

  const token = await getGithubTokenForUser(authz.userId);
  if (!token) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.status}` },
        { status: 502 },
      );
    }
    const raw = (await res.json()) as Array<{ name: string }>;
    const names = raw.map((b) => b.name);
    const branches = orderBranchOptions(names, defaultBranch);

    return NextResponse.json({ branches });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch branches" },
      { status: 502 },
    );
  }
}
