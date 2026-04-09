"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RepoItem {
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  url: string;
}

export interface BranchItem {
  name: string;
  protected: boolean;
}

export function useRepositoryPicker() {
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoItem | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [baseBranch, setBaseBranch] = useState("");

  const statusFetched = useRef(false);
  const reposFetched = useRef(false);

  const checkStatus = useCallback(async () => {
    if (statusFetched.current) return;
    statusFetched.current = true;
    try {
      const res = await fetch("/api/github/status");
      if (!res.ok) {
        setGithubConnected(false);
        return;
      }
      const data = (await res.json()) as {
        connected: boolean;
        login: string | null;
      };
      setGithubConnected(data.connected);
      setGithubLogin(data.login);
    } catch {
      setGithubConnected(false);
    }
  }, []);

  const loadRepos = useCallback(async () => {
    if (reposFetched.current) return;
    reposFetched.current = true;
    setReposLoading(true);
    try {
      const res = await fetch("/api/github/repositories");
      if (!res.ok) {
        setReposLoading(false);
        return;
      }
      const data = (await res.json()) as RepoItem[];
      setRepos(data);
    } catch {
      // keep empty on error
    }
    setReposLoading(false);
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    if (githubConnected) {
      void loadRepos();
    }
  }, [githubConnected, loadRepos]);

  const loadBranches = useCallback(
    async (owner: string, repo: string) => {
      setBranchesLoading(true);
      try {
        const res = await fetch(
          `/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
        );
        if (!res.ok) {
          setBranchesLoading(false);
          return;
        }
        const data = (await res.json()) as BranchItem[];
        setBranches(data);
      } catch {
        setBranches([]);
      }
      setBranchesLoading(false);
    },
    [],
  );

  const selectRepo = useCallback(
    (fullName: string) => {
      const repo = repos.find((r) => r.fullName === fullName) ?? null;
      setSelectedRepo(repo);
      setBranches([]);
      if (repo) {
        setBaseBranch(repo.defaultBranch);
        void loadBranches(repo.owner, repo.name);
      } else {
        setBaseBranch("");
      }
    },
    [repos, loadBranches],
  );

  const selectBranch = useCallback((branch: string) => {
    setBaseBranch(branch);
  }, []);

  const branchOptions = useMemo(() => {
    if (branches.length > 0) return branches.map((b) => b.name);
    if (selectedRepo) return [selectedRepo.defaultBranch];
    return [];
  }, [branches, selectedRepo]);

  return {
    githubConnected,
    githubLogin,
    repos,
    reposLoading,
    selectedRepo,
    branches,
    branchesLoading,
    baseBranch,
    branchOptions,

    selectRepo,
    selectBranch,
    checkStatus,
    loadRepos,
  };
}
