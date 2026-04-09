"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickDefaultBranch } from "@/lib/branches";
import type { SelectOption } from "@/components/ui/searchable-single-select";

export interface RepoItem {
  id: string;
  name: string;
  repoName?: string;
  owner?: string;
  url: string;
  defaultBranch: string;
  installationId: string | null;
}

const LAST_REPO_COOKIE = "last-repo";

function setLastRepoCookie(repo: RepoItem, branch?: string): void {
  const payload = { ...repo, lastBranch: branch || repo.defaultBranch };
  const json = encodeURIComponent(JSON.stringify(payload));
  document.cookie = `${LAST_REPO_COOKIE}=${json}; path=/; max-age=31536000; SameSite=Lax`;
}

export function useRepositoryPicker({
  repositories,
  initialGithubConnected,
  initialBranch,
}: {
  repositories: RepoItem[];
  initialGithubConnected: boolean | null;
  initialBranch: string;
}) {
  const [availableRepositories, setAvailableRepositories] =
    useState<RepoItem[]>(repositories);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(
    initialGithubConnected,
  );
  const [reposLoading, setReposLoading] = useState(
    initialGithubConnected !== false && repositories.length === 0,
  );
  const [selectedRepositoryId, setSelectedRepositoryId] = useState(
    repositories.length > 0 ? repositories[0].id : "",
  );
  const [baseBranch, setBaseBranch] = useState(initialBranch);
  const [branchesById, setBranchesById] = useState<Record<string, string[]>>(
    {},
  );

  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);

  const branchSyncRef = useRef<Set<string>>(new Set());
  const fetchedRef = useRef(false);
  const userSelectedRef = useRef(false);
  const ownersRef = useRef<Array<{ login: string }>>([]);
  const meRef = useRef<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paginationRef = useRef<
    Map<string, { page: number; exhausted: boolean }>
  >(new Map());

  const mergeRepos = useCallback((incoming: RepoItem[]) => {
    setAvailableRepositories((prev) => {
      const byUrl = new Map(prev.map((r) => [r.url, r]));
      for (const repo of incoming) byUrl.set(repo.url, repo);
      return Array.from(byUrl.values());
    });
  }, []);

  const loadRepos = useCallback(async () => {
    if (fetchedRef.current) return;
    setReposLoading(true);
    try {
      const res = await fetch("/api/github/repositories");
      if (res.status === 403) {
        setGithubConnected(false);
        setAvailableRepositories([]);
        setReposLoading(false);
        return;
      }
      if (!res.ok) {
        setReposLoading(false);
        return;
      }
      const data = (await res.json()) as {
        githubConnected?: boolean;
        owners?: Array<{ login: string }>;
        me?: string;
      };
      if (typeof data.githubConnected === "boolean") {
        setGithubConnected(data.githubConnected);
      }
      const owners = data.owners ?? [];
      const me = data.me ?? null;
      ownersRef.current = owners;
      meRef.current = me;

      const results = await Promise.all(
        owners.map(async (o) => {
          const params = new URLSearchParams({ org: o.login, per_page: "50" });
          if (me) params.set("me", me);
          const r = await fetch(`/api/github/repositories?${params}`);
          if (!r.ok) return [];
          const d = (await r.json()) as { repos?: RepoItem[] };
          const repos = d.repos ?? [];
          paginationRef.current.set(o.login, {
            page: 1,
            exhausted: repos.length < 50,
          });
          return repos;
        }),
      );
      mergeRepos(results.flat());
    } catch {
      // keep existing repos on failure
    }
    fetchedRef.current = true;
    setReposLoading(false);
  }, [mergeRepos]);

  const searchRepos = useCallback(
    (query: string) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const trimmed = query.trim();
      if (!trimmed || trimmed.length < 2) {
        setSearching(false);
        return;
      }
      setSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        const owners = ownersRef.current;
        const me = meRef.current;
        if (owners.length === 0) {
          setSearching(false);
          return;
        }
        try {
          const results = await Promise.all(
            owners.map(async (o) => {
              const params = new URLSearchParams({
                org: o.login,
                search: trimmed,
                per_page: "30",
              });
              if (me) params.set("me", me);
              const r = await fetch(`/api/github/repositories?${params}`);
              if (!r.ok) return [];
              const d = (await r.json()) as { repos?: RepoItem[] };
              return d.repos ?? [];
            }),
          );
          mergeRepos(results.flat());
        } catch {
          // keep existing repos on failure
        }
        setSearching(false);
      }, 300);
    },
    [mergeRepos],
  );

  const hasMore = useMemo(() => {
    const pagination = paginationRef.current;
    if (pagination.size === 0) return false;
    for (const state of pagination.values()) {
      if (!state.exhausted) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRepositories]);

  const loadMoreRepos = useCallback(async () => {
    const pagination = paginationRef.current;
    if (loadingMore || pagination.size === 0) return;
    const ownersToFetch = ownersRef.current.filter((o) => {
      const state = pagination.get(o.login);
      return state && !state.exhausted;
    });
    if (ownersToFetch.length === 0) return;
    setLoadingMore(true);
    try {
      const results = await Promise.all(
        ownersToFetch.map(async (o) => {
          const state = pagination.get(o.login)!;
          const nextPage = state.page + 1;
          const params = new URLSearchParams({
            org: o.login,
            page: String(nextPage),
            per_page: "30",
          });
          const me = meRef.current;
          if (me) params.set("me", me);
          const r = await fetch(`/api/github/repositories?${params}`);
          if (!r.ok) return [];
          const d = (await r.json()) as { repos?: RepoItem[] };
          const repos = d.repos ?? [];
          pagination.set(o.login, {
            page: nextPage,
            exhausted: repos.length < 30,
          });
          return repos;
        }),
      );
      mergeRepos(results.flat());
    } catch {
      // keep existing repos on failure
    }
    setLoadingMore(false);
  }, [loadingMore, mergeRepos]);

  const selectedRepository = useMemo(
    () =>
      availableRepositories.find(
        (repo) => repo.id === selectedRepositoryId,
      ) ?? null,
    [availableRepositories, selectedRepositoryId],
  );

  useEffect(() => {
    if (userSelectedRef.current) return;
    if (
      selectedRepositoryId &&
      !availableRepositories.some((repo) => repo.id === selectedRepositoryId)
    ) {
      setSelectedRepositoryId(availableRepositories[0]?.id ?? "");
    }
  }, [availableRepositories, selectedRepositoryId]);

  function selectRepository(id: string) {
    userSelectedRef.current = true;
    setSelectedRepositoryId(id);
    const repo = availableRepositories.find((r) => r.id === id);
    if (repo) setLastRepoCookie(repo);
  }

  useEffect(() => {
    if (!selectedRepository) return;
    const repoId = selectedRepository.id;
    const syncState = branchSyncRef.current;
    if (syncState.has(repoId)) return;
    syncState.add(repoId);

    const repo = selectedRepository;
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams();
        if (repo.owner) {
          params.set("owner", repo.owner);
          params.set(
            "repo",
            repo.repoName ?? repo.name.split("/").pop() ?? repo.name,
          );
          params.set("defaultBranch", repo.defaultBranch);
        }
        const res = await fetch(`/api/github/branches?${params.toString()}`);
        if (!res.ok) {
          syncState.delete(repoId);
          return;
        }
        const data = (await res.json()) as { branches?: string[] };
        if (cancelled) return;
        const fetched = Array.isArray(data.branches) ? data.branches : [];
        if (fetched.length === 0) return;
        setBranchesById((cur) => ({ ...cur, [repoId]: fetched }));
      } catch {
        syncState.delete(repoId);
      }
    }
    void load();
    return () => {
      cancelled = true;
      syncState.delete(repoId);
    };
  }, [selectedRepository]);

  const branchOptions = useMemo(() => {
    if (!selectedRepository) return [];
    return branchesById[selectedRepository.id] ?? [
      selectedRepository.defaultBranch,
    ];
  }, [branchesById, selectedRepository]);

  useEffect(() => {
    if (!selectedRepository) {
      setBaseBranch("");
      return;
    }
    if (baseBranch && branchOptions.includes(baseBranch)) return;
    setBaseBranch(
      pickDefaultBranch(branchOptions, selectedRepository.defaultBranch),
    );
  }, [selectedRepository, branchOptions, baseBranch]);

  function selectBranch(branch: string) {
    setBaseBranch(branch);
    if (selectedRepository) setLastRepoCookie(selectedRepository, branch);
  }

  const repositoryOptions = useMemo<SelectOption[]>(
    () =>
      availableRepositories.map((repo) => {
        const [ownerFromName = "", repoNameFromName = repo.name] =
          repo.name.split("/");
        return {
          id: repo.id,
          label: repo.repoName ?? repoNameFromName,
          subLabel: (repo.owner ?? ownerFromName) || undefined,
        };
      }),
    [availableRepositories],
  );

  const branchSelectOptions = useMemo<SelectOption[]>(
    () => branchOptions.map((b) => ({ id: b, label: b })),
    [branchOptions],
  );

  function persistSelection() {
    if (selectedRepository) setLastRepoCookie(selectedRepository, baseBranch);
  }

  return {
    githubConnected,
    reposLoading,
    loadingMore,
    searching,
    hasMore,
    selectedRepository,
    selectedRepositoryId,
    baseBranch,
    branchOptions,

    repositoryOptions,
    branchSelectOptions,

    loadRepos,
    loadMoreRepos,
    searchRepos,
    selectRepository,
    selectBranch,
    persistSelection,
  };
}
