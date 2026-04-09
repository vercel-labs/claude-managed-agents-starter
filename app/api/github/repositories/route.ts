import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUserId } from "@/lib/session";
import { getGithubTokenForUser } from "@/lib/get-github-token";

export const dynamic = "force-dynamic";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  html_url: string;
}

function mapRepo(r: GitHubRepo) {
  return {
    id: String(r.id),
    name: r.full_name,
    repoName: r.name,
    owner: r.owner.login,
    url: r.html_url,
    defaultBranch: r.default_branch,
    installationId: null,
  };
}

async function ghFetch(url: string, token: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
}

export async function GET(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const token = await getGithubTokenForUser(authz.userId);
  if (!token) {
    return NextResponse.json(
      { githubConnected: false },
      { status: 403 },
    );
  }

  const org = request.nextUrl.searchParams.get("org");

  if (!org) {
    try {
      const userRes = await ghFetch("https://api.github.com/user", token);
      if (!userRes.ok) {
        return NextResponse.json({ githubConnected: false }, { status: 403 });
      }
      const user = (await userRes.json()) as { login: string };

      const orgsRes = await ghFetch("https://api.github.com/user/orgs?per_page=100", token);
      const orgs = orgsRes.ok
        ? ((await orgsRes.json()) as Array<{ login: string }>)
        : [];

      const owners = [
        { login: user.login },
        ...orgs.filter((o) => o.login !== user.login),
      ];

      return NextResponse.json({
        githubConnected: true,
        owners,
        me: user.login,
      });
    } catch {
      return NextResponse.json({ githubConnected: false }, { status: 502 });
    }
  }

  const search = request.nextUrl.searchParams.get("search");
  const page = request.nextUrl.searchParams.get("page") ?? "1";
  const perPage = request.nextUrl.searchParams.get("per_page") ?? "50";
  const me = request.nextUrl.searchParams.get("me");

  try {
    let repos: GitHubRepo[];

    if (search) {
      const q = `${search} in:name user:${org} fork:true`;
      const res = await ghFetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&sort=updated`,
        token,
      );
      if (!res.ok) return NextResponse.json({ repos: [] });
      const data = (await res.json()) as { items?: GitHubRepo[] };
      repos = data.items ?? [];
    } else {
      const isMe = me && org === me;
      const url = isMe
        ? `https://api.github.com/user/repos?sort=pushed&per_page=${perPage}&page=${page}&affiliation=owner`
        : `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?sort=pushed&per_page=${perPage}&page=${page}`;
      const res = await ghFetch(url, token);
      if (!res.ok) return NextResponse.json({ repos: [] });
      repos = (await res.json()) as GitHubRepo[];
    }

    return NextResponse.json({ repos: repos.map(mapRepo) });
  } catch {
    return NextResponse.json({ repos: [] });
  }
}
