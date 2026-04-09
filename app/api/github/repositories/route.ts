import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGithubTokenForUser } from "@/lib/get-github-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const token = await getGithubTokenForUser(authz.userId);
  if (!token) {
    return NextResponse.json(
      { error: "GitHub not connected" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      "https://api.github.com/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member",
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
    const repos = (await res.json()) as Array<{
      full_name: string;
      name: string;
      owner: { login: string };
      private: boolean;
      default_branch: string;
      html_url: string;
    }>;

    return NextResponse.json(
      repos.map((r) => ({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner.login,
        isPrivate: r.private,
        defaultBranch: r.default_branch,
        url: r.html_url,
      })),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch repos" },
      { status: 502 },
    );
  }
}
