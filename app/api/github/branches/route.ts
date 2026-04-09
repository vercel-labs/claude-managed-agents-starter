import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGithubTokenForUser } from "@/lib/get-github-token";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const owner = request.nextUrl.searchParams.get("owner");
  const repo = request.nextUrl.searchParams.get("repo");
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
    const branches = (await res.json()) as Array<{
      name: string;
      protected: boolean;
    }>;

    return NextResponse.json(
      branches.map((b) => ({
        name: b.name,
        protected: b.protected,
      })),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch branches" },
      { status: 502 },
    );
  }
}
