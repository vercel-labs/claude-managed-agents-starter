const DEFAULT_BRANCH_CANDIDATES = ["main", "master", "trunk", "develop"];

function cleanBranchName(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function orderBranchOptions(
  branches: string[],
  preferredBranch?: string | null,
): string[] {
  const unique = Array.from(
    new Set(
      branches
        .map((branch) => cleanBranchName(branch))
        .filter((branch): branch is string => Boolean(branch)),
    ),
  );
  const preferred = cleanBranchName(preferredBranch);

  let first: string | null = null;
  if (preferred && unique.includes(preferred)) {
    first = preferred;
  } else {
    first =
      DEFAULT_BRANCH_CANDIDATES.find((candidate) => unique.includes(candidate)) ??
      preferred ??
      unique[0] ??
      "main";
  }

  const rest = unique.filter((branch) => branch !== first);
  return [first, ...rest];
}

export function pickDefaultBranch(
  branches: string[],
  preferredBranch?: string | null,
): string {
  return orderBranchOptions(branches, preferredBranch)[0] ?? "main";
}
