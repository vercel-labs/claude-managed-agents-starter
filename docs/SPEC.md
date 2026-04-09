# Product Spec: Claude Managed Agents Showcase

## Purpose

A reference implementation demonstrating how to build a production-quality web UI on top of Anthropic's Managed Agents API using Next.js 16, Neon Postgres, and Vercel's Workflow SDK. The app showcases the **poll-and-persist** pattern for long-running agent work - no client-side streaming, no WebSockets, just durable server-side polling with a REST-based UI.

## Target Audience

Developers evaluating or integrating with the Anthropic Managed Agents beta API who want a working example of:

- Session lifecycle management (create, message, tail, terminate)
- Durable event persistence with idempotent inserts
- Auth-protected multi-user access with Vercel OAuth
- A clean, dark-mode chat UI for inspecting agent behavior

---

## Core Concepts

### Managed Agents API

Anthropic's Managed Agents API (`client.beta.sessions`) provides:

- **Sessions**: long-running agent environments with tools, MCP servers, and configurable behavior
- **Events**: an append-only log of everything the agent does (messages, tool calls, status transitions)
- **Event sending**: `events.send()` to inject user messages into a running session
- **Event listing**: `events.list()` to paginate through the session's event history

The API is asynchronous - you send a message and poll for results. There is no streaming endpoint for managed sessions.

### Poll-and-Persist Pattern

This app implements the pattern described in [docs/streaming-long-running-agents.md](streaming-long-running-agents.md):

1. **Persist a canonical event log** - every Anthropic event is written to Postgres with a unique constraint for idempotency
2. **Use a durable workflow for polling** - the Workflow SDK provides crash-safe `sleep()` and retryable steps
3. **Serve the UI from the database** - the client polls a REST endpoint that reads from Postgres, not from Anthropic directly
4. **Treat Anthropic as the source, Postgres as the system of record** - if the workflow crashes, it resumes and catches up

This means:
- The client never talks to Anthropic directly
- Multiple clients can view the same session (multi-device, shared links)
- The UI works even if the agent finished hours ago
- Event history survives server restarts, deploys, and tab closures

---

## User Flows

### 1. Unauthenticated Landing

**Entry**: User visits `/`

**Behavior**:
- Home page renders with a centered chat composer ("What do you want Claude to do?")
- Sidebar shows Vercel icon, "New session" link, and "Sign in" button at the bottom
- Typing in the composer opens the sign-in modal (Dialog with "Continue with Vercel" button)
- Clicking "Continue with Vercel" initiates Better Auth generic OAuth flow with Vercel OIDC

**Auth flow**:
1. Redirect to Vercel's authorization endpoint (PKCE, scopes: openid, email, profile, offline_access)
2. User authorizes on Vercel
3. Callback to `/api/auth/oauth2/callback/vercel`
4. Better Auth creates/links user + account rows, sets session cookie
5. Redirect back to `/`

### 2. Create a Session and Send First Message

**Entry**: Authenticated user types in the home composer and hits Enter (or clicks send)

**Sequence**:
1. `POST /api/managed-agents/session` - creates Anthropic session, inserts `managed_agent_session` row
2. `POST /api/managed-agents/message` - sends user message to Anthropic via `events.send()`
3. Message handler updates title from first message text (truncated to 60 chars)
4. Message handler acquires tailing lock (`tailing: false` -> `true`) and starts `tailSessionWorkflow`
5. Client navigates to `/chat/{sessionId}`

### 3. View Agent Activity

**Entry**: User is on `/chat/{sessionId}`

**Behavior**:
- `ChatPanel` polls `GET /api/managed-agents/transcript?sessionId=...`
- Poll interval: 2.5s while `tailing=true`, 5s when idle
- Events are rendered as they appear:
  - `user.message` - dark bubble, right-aligned
  - `agent.message` - plain text, left-aligned
  - `agent.tool_use` / `agent.mcp_tool_use` / `agent.custom_tool_use` - collapsible tool call row with name and JSON input
  - `agent.thinking` - spinning loader with "Thinking" label
  - `session.status_running` - green pulsing dot with "Agent is running"
  - `session.status_idle` with `requires_action` - amber warning card ("Requires action")
  - Other events - raw JSON fallback with type label
- Header shows "syncing" indicator while `tailing=true`
- Scroll auto-follows new events

### 4. Send Follow-up Messages

**Entry**: User types in the chat composer while viewing a session

**Behavior**:
- `POST /api/managed-agents/message` sends the message
- If the workflow had stopped (agent was idle), a new tailing workflow starts
- If the workflow is already running, it continues polling (no duplicate workflow)
- The tailing lock (`tailing` boolean) prevents concurrent workflows per session

### 5. Delete a Session

**Entry**: User clicks delete on a session in the sidebar

**Behavior**:
- `DELETE /api/managed-agents/session?sessionId=...`
- Deletes all `managed_agent_event` rows for the session, then the session row itself
- User-scoped: you can only delete your own sessions
- Does NOT delete the Anthropic session (it continues to exist on Anthropic's side)

### 6. Sign Out

**Entry**: User clicks their name in the sidebar, then "Sign out"

**Behavior**:
- `authClient.signOut()` clears the session cookie via Better Auth
- `window.location.href = "/"` forces a full page reload (not `router.push`)
- User returns to unauthenticated landing state

---

## API Specification

### `POST /api/managed-agents/session`

Creates a new managed agent session.

**Auth**: Required (session cookie)

**Request body**: None

**Response** (201):
```json
{ "id": "uuid" }
```

**Errors**:
- 401: Unauthorized
- 502: Anthropic API error (missing env vars, API key invalid, etc.)

**Side effects**:
- Calls `client.beta.sessions.create({ agent, environment_id })`
- Inserts `managed_agent_session` row

### `DELETE /api/managed-agents/session?sessionId={id}`

Deletes a session and all its events.

**Auth**: Required, user-scoped

**Response** (200):
```json
{ "ok": true }
```

**Errors**:
- 400: Missing sessionId
- 401: Unauthorized
- 404: Session not found or not owned by user

### `GET /api/managed-agents/sessions`

Lists the current user's sessions.

**Auth**: Required

**Response** (200):
```json
{
  "sessions": [
    {
      "id": "uuid",
      "title": "Hello world",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "tailing": false
    }
  ]
}
```

Ordered by `updatedAt` descending.

### `POST /api/managed-agents/message`

Sends a user message to an existing session.

**Auth**: Required, user-scoped

**Request body**:
```json
{
  "sessionId": "uuid",
  "text": "Hello"
}
```

**Response** (200):
```json
{ "ok": true }
```

**Errors**:
- 400: Missing sessionId or text
- 401: Unauthorized
- 404: Session not found or not owned by user
- 502: Anthropic API error

**Side effects**:
- Calls `client.beta.sessions.events.send()` with `user.message` event
- Updates session title from first message (if title is still "New chat")
- Acquires tailing lock and starts `tailSessionWorkflow` if not already tailing

### `GET /api/managed-agents/transcript?sessionId={id}`

Returns persisted events for a session.

**Auth**: Required, user-scoped

**Response** (200):
```json
{
  "tailing": true,
  "events": [
    {
      "id": "uuid",
      "anthropicEventId": "evt_...",
      "type": "user.message",
      "payload": { ... },
      "processedAt": "2025-01-01T00:00:00.000Z",
      "occurredAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

Events ordered by `occurredAt` ascending.

---

## Tailing Workflow

The `tailSessionWorkflow` is the heart of the system. It runs as a durable Workflow SDK function.

### Lifecycle

```
START (triggered by message handler)
  |
  loop:
    |-- pollSessionEventsStep
    |     |-- client.beta.sessions.events.list(anthropicSessionId, { order: "desc", limit: 50 })
    |     |-- Paginate backwards through events
    |     |-- INSERT each event (ON CONFLICT DO NOTHING)
    |     |-- Stop paginating when all events on a page are duplicates
    |     |-- Bump session updatedAt if any new events inserted
    |     |-- Return { terminal: bool }
    |
    |-- If terminal: clearTailingStep (set tailing=false), EXIT
    |-- If not terminal: sleep("10s"), continue loop
```

### Terminal Events

The workflow stops when it sees any of:
- `session.status_terminated`
- `session.deleted`
- `session.error`
- `session.status_idle` with `stop_reason.type` of `end_turn`, `requires_action`, or `retries_exhausted`

### Idempotency

Events are deduplicated by the unique constraint on `(sessionId, anthropicEventId)`. The workflow uses `ON CONFLICT DO NOTHING`, so re-polling the same events is safe. This is critical because:
- Workflows can be replayed after crashes
- Multiple poll iterations may overlap with the same event window
- The Anthropic API returns events in pages that may include previously seen events

### Concurrency Control

Only one tailing workflow runs per session at a time. The message handler uses an atomic UPDATE with a WHERE clause (`tailing = false`) to acquire the lock. If another message arrives while tailing is active, it skips starting a new workflow.

---

## Security Model

### Authentication

- Better Auth with Vercel OIDC (generic OAuth plugin)
- Session cookie (`better-auth.session_token`) set on sign-in
- `nextCookies()` plugin enables server-side cookie reading in Next.js

### Authorization

- All `/api/managed-agents/*` routes call `requireUserId()` which validates the session cookie
- Every database query filters by `userId` - users can only see/modify their own sessions
- Middleware blocks unauthenticated access to `/chat*` and `/api/managed-agents*`

### Data Isolation

- Anthropic API calls use a single shared API key (`ANTHROPIC_API_KEY`)
- Session-to-user mapping is enforced at the application layer, not the Anthropic API layer
- Deleting a session removes local data only; the Anthropic session persists independently

---

## Known Limitations

1. **No real-time streaming** - UI updates every 2.5-5s via polling. Users see batched updates, not token-by-token streaming.
2. **10s poll interval in workflow** - events may take up to 10s to appear in the UI after Anthropic processes them.
3. **Single agent/environment** - all sessions use the same `ANTHROPIC_AGENT_ID` and `ANTHROPIC_ENVIRONMENT_ID`. There is no UI for switching agents.
4. **No Anthropic-side cleanup** - deleting a session locally does not delete it on Anthropic. Sessions may accumulate on Anthropic's side.
5. **No pagination** - the session list loads all sessions (no limit in practice, though the query has no explicit cap). The transcript endpoint returns all events for a session.
6. **No file/image support** - only text messages are supported. Tool call inputs are shown as JSON.
7. **`requires_action` is informational only** - if the agent needs confirmation, the user must go to the Anthropic console. There is no in-app approval flow.

---

## Future Considerations

- **Streaming via SSE** - serve events from Postgres via Server-Sent Events for lower-latency UI updates
- **Multi-agent support** - let users select from multiple configured agents
- **In-app tool approval** - handle `requires_action` events with an approve/reject UI
- **Event filtering** - show/hide tool calls, thinking events, status transitions
- **Export** - download conversation transcript as JSON or markdown
- **Anthropic session cleanup** - delete remote sessions when local ones are deleted
