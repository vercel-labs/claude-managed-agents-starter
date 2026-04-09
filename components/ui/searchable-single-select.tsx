"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

export interface SelectOption {
  id: string;
  label: string;
  subLabel?: string;
}

function getStoredRecentIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(0, 4);
  } catch {
    return [];
  }
}

function storeRecentId(key: string, id: string): void {
  const next = [
    id,
    ...getStoredRecentIds(key).filter((entry) => entry !== id),
  ].slice(0, 4);
  localStorage.setItem(key, JSON.stringify(next));
}

export function SearchableSingleSelect({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel,
  disabled = false,
  loading = false,
  showSearch = true,
  showRecents = true,
  recentStorageKey,
  compact = false,
  showSubLabelInTrigger = true,
  maxLabelWidthClassName = "max-w-52",
  mobileIcon,
  footer,
  onOpenChange,
  onSearchChange,
  onLoadMore,
  loadingMore = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel: string;
  disabled?: boolean;
  loading?: boolean;
  showSearch?: boolean;
  showRecents?: boolean;
  recentStorageKey?: string;
  compact?: boolean;
  showSubLabelInTrigger?: boolean;
  maxLabelWidthClassName?: string;
  mobileIcon?: React.ReactNode;
  footer?: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  onSearchChange?: (query: string) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    recentStorageKey ? getStoredRecentIds(recentStorageKey) : [],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !onLoadMore || loadingMore) return;
    const threshold = 40;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      onLoadMore();
    }
  }, [onLoadMore, loadingMore]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedOption = options.find((option) => option.id === value) ?? null;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(normalizedSearch) ||
          option.subLabel?.toLowerCase().includes(normalizedSearch),
      )
    : options;
  const recentSet = new Set(recentIds);
  const recentOptions = showRecents
    ? recentIds
        .map((id) => options.find((option) => option.id === id) ?? null)
        .filter((option): option is SelectOption => Boolean(option))
    : [];
  const mainOptions = normalizedSearch
    ? filteredOptions
    : filteredOptions.filter((option) => !recentSet.has(option.id));

  function handleSelect(id: string) {
    onChange(id);
    if (recentStorageKey) {
      storeRecentId(recentStorageKey, id);
      setRecentIds(getStoredRecentIds(recentStorageKey));
    }
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled && !loading}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => {
            const next = !current;
            if (!next) setSearch("");
            return next;
          });
          if (!open) onOpenChange?.(true);
        }}
        className={`inline-flex items-center gap-1 rounded-full ${
          compact ? "h-7 text-xs" : "h-7 text-sm"
        } ${mobileIcon ? "px-1.5 sm:px-2.5" : "px-2.5"} cursor-pointer text-muted-foreground transition-colors hover:bg-muted/60 hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {mobileIcon && (
          <span className="sm:hidden">{mobileIcon}</span>
        )}
        <span
          className={`truncate ${maxLabelWidthClassName} text-muted-foreground ${mobileIcon ? "hidden sm:inline" : ""}`}
        >
          {selectedOption
            ? showSubLabelInTrigger && selectedOption.subLabel
              ? `${selectedOption.subLabel}/${selectedOption.label}`
              : selectedOption.label
            : placeholder}
        </span>
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onMouseDown={() => {
              setOpen(false);
              setSearch("");
            }}
          />

          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border-t border-border bg-popover sm:absolute sm:inset-auto sm:left-0 sm:bottom-full sm:mb-2 sm:w-72 sm:rounded-xl sm:border sm:shadow-xl">
            <div className="flex justify-center py-2 sm:hidden">
              <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-3 pb-1 sm:hidden">
              <span className="text-xs font-medium text-muted-foreground">
                {placeholder}
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setOpen(false);
                  setSearch("");
                }}
                className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {showSearch && (
              <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  aria-label="Search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    onSearchChange?.(e.target.value);
                  }}
                  placeholder={`Search ${placeholder.toLowerCase().replace("select ", "")}...`}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            )}

            <div ref={listRef} onScroll={handleScroll} className="max-h-[60vh] overflow-y-auto py-1 sm:max-h-72">
              {!normalizedSearch && recentOptions.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-xs text-muted-foreground">
                      Recent
                    </span>
                  </div>
                  {recentOptions.map((option) => (
                    <SelectRow
                      key={`recent-${option.id}`}
                      option={option}
                      checked={value === option.id}
                      onClick={() => handleSelect(option.id)}
                    />
                  ))}
                  <div className="mx-3 my-1.5 border-t border-border" />
                </>
              )}

              {!normalizedSearch &&
                recentOptions.length > 0 &&
                mainOptions.length > 0 && (
                  <div className="px-3 pt-1 pb-1">
                    <span className="text-xs text-muted-foreground">
                      All Repositories
                    </span>
                  </div>
                )}

              {mainOptions.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-xs text-muted-foreground">{emptyLabel}</p>
                  )}
                </div>
              ) : (
                mainOptions.map((option) => (
                  <SelectRow
                    key={option.id}
                    option={option}
                    checked={value === option.id}
                    onClick={() => handleSelect(option.id)}
                  />
                ))
              )}
              {loadingMore && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {footer && (
              <div className="border-t border-border px-3 py-2.5">{footer}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SelectRow({
  option,
  checked,
  onClick,
}: {
  option: SelectOption;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{option.label}</p>
        {option.subLabel ? (
          <p className="truncate text-[11px] text-muted-foreground">
            {option.subLabel}
          </p>
        ) : null}
      </div>
      {checked && <Check className="size-3 shrink-0 text-muted-foreground" />}
    </button>
  );
}
