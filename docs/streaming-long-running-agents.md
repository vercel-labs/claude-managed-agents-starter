# Streaming long-running agent work: patterns, persistence, and what "counts"

Long-running agent runs—minutes to hours, dozens of tool calls, partial failures and reconnects—don't fit the same playbook as a single chat completion. **Streaming** is how you make progress *feel* real time, but **streaming alone is not a durability strategy**. This post separates **how you move bytes**, **what you keep**, and **what you show**, with tradeoffs product teams actually hit (including Claude Managed Agents–style session/event APIs).

## Why "just stream it" breaks down

A naïve design: open one HTTP response, read the provider's SSE/WebSocket, forward every chunk to the browser, done.

That works until:

- The **serverless function** or **proxy** hits a **time limit** (common on hosted platforms).
- The **client** loses the tab, network, or laptop sleep.
- You need **retries**, **idempotency**, or **audit** ("what did the agent do at 14:32?").
- You want **multiple viewers** (support, manager, second device) on the same run.

So: **streaming is for latency and UX; persistence is for truth and recovery.** The art is deciding how much of the stream becomes durable truth, how much is a disposable view, and how much never leaves memory.

## Three layers: exists / shown / persisted

Think in three buckets:

### 1. What *exists* (ephemeral)

- In-flight chunks in a **ReadableStream** before you commit them.
- **WebSocket** frames that were delivered but never written to a store.
- **Provider-side** session state you don't control (the managed environment, tool execution, partial buffers).

**Role:** minimum latency. **Risk:** if the process dies here, that data is gone unless the provider lets you **replay** (e.g. refetch events, reopen a stream with a cursor).

### 2. What is *shown* (presentation / projection)

- Rendered markdown, collapsed tool cards, "thinking" spinners, aggregated "Step 3 of 12."
- **Derived** views: summaries, timelines, error banners.

**Role:** usability. **Does not have to equal** the canonical log. You might show a **summary** while persisting **full tool I/O** for compliance.

### 3. What is *persisted* (durable truth)

- **Canonical event log** (append-only): user messages, model tokens, tool calls, tool results, status transitions (`idle`, `error`), provider event IDs if available.
- **Cursors** for reconnect: last seen sequence, `startIndex`, provider-specific tokens.
- **Session metadata**: tenant, user, agent version, environment id.

**Role:** replay, billing, debugging, multi-device, "continue tomorrow." **Cost:** storage, write amplification, PII/governance.

**Rule of thumb:** persist **enough** to reconstruct *what mattered for the product* (and regulators); show **less** when it reduces noise; let **ephemeral** layers be as thin as your risk tolerance allows.

## How streaming is usually handled for long runs (non-serverless)

When you're **not** fighting strict per-request wall clocks, the common pattern is:

1. **Long-lived process** (container, VM, worker) holds **`events.stream`** (or equivalent) against the provider.
2. **`events.send`** (or equivalent) starts or steers work.
3. For each event: **normalize** → optionally **fan out** to clients (SSE/WebSocket) **and** **append to a durable log** (often async/batched).

At scale you split:

- **Control plane**: auth, create session, enqueue "tail this session."
- **Stream workers**: one logical consumer per session (or sharded), publishing to **Redis/NATS/Kafka** or writing **Postgres** and notifying subscribers.

**Sticky sessions** or a **realtime gateway** (Ably, Pusher, managed WebSockets) avoid reinventing horizontal scale for browser connections.

**Reconnect:** clients send **Last-Event-ID** or your **cursor**; server replays from the **persisted** log, then continues live. Ephemeral "exists only in the wire" gaps disappear if **every meaningful chunk** was committed before you relied on it.

## How it's handled when the host *is* short-lived (e.g. many serverless setups)

You cannot keep one invocation open for hours. Typical mitigations:

1. **Pull model:** short functions **fetch deltas** (list/read events + cursor) on a schedule or via **durable workflow** `sleep` + steps; **DB** is source of truth; UI polls or uses very short-lived streams fed *from* the DB.
2. **Durable streaming middleware:** e.g. workflow run **`getReadable({ startIndex })`** so HTTP streams can **reconnect** and replay **already-buffered** chunks—still bounded by platform stream lifetime; **not** a substitute for a real event store for hours unless you keep writing through to storage.
3. **External tailer:** a small **always-on** service holds the provider stream and writes to your DB; serverless only serves UI/API.

Tradeoff: **higher latency** vs streaming from the provider directly, but **predictable** operations and **honest** multi-hour behavior.

## Tradeoffs: how much to persist vs show vs leave ephemeral

| Concern | Persist more | Persist less |
|--------|----------------|--------------|
| **Compliance / audit** | Full tool inputs/outputs, prompts, model IDs | High-level steps only |
| **Cost** | Larger blobs, indexing, retention policies | Summaries + hashes of artifacts |
| **UX** | Full replay, diff views, "jump to tool call" | Cheaper storage; may lose forensic detail |
| **Latency** | Sync write on every chunk → slower tail | Batch writes → risk of small loss on crash |
| **Privacy** | Everything in your DB = your breach surface | Truncate/redact before write; store refs to blob store with TTL |

**Practical splits:**

- **Persist:** structured events with stable IDs, cursors, final outcomes, user-visible errors.
- **Show:** human-readable projections; don't dump raw JSON unless the user is "debug mode."
- **Ephemeral:** fine-grained token deltas *if* you can always **rebuild** from persisted events or refetch from the provider.

For **Managed Agents**-style APIs, the **provider** often retains **session/event history** longer than your process—treat that as **optional backup**, not your primary store, unless contracts and latency allow you to rely on it alone.

## A small decision checklist

1. **If the stream dies mid-run, what must the user see after refresh?** Whatever that is → **persist** (or be able to **refetch** identically).
2. **Do you bill or enforce limits per tool call?** → persist **each** tool boundary with timestamps.
3. **Do you need "export conversation"?** → canonical log must contain exportable fields; "shown" summaries may omit internals.
4. **Regulated data in tool output?** → persist **redacted** or **encrypted**; keep ephemeral copies out of logs.
5. **Many concurrent long runs?** → favor **append-only store + cursor** and **rate-limit** provider reads; streaming fan-out scales with **workers + bus**, not with one giant function.

## Closing

**Streaming** answers: "How fast does the UI update?"  
**Persistence** answers: "What is true when something breaks?"  
**Presentation** answers: "What should a human actually read?"

For **long-running** agent tasks, mature products almost always **persist a canonical event stream** (or equivalent) and use **live streaming as a view** on top—not as the only system of record. On **short-lived** hosts, that pushes you toward **pull + cursor + DB** or an **external tailer**; on **long-lived** hosts, you can stream end-to-end—but you still **persist and cursor** for reconnects and trust.
