# UI Conventions

## Design System

- **Component library**: shadcn/ui with `@base-ui/react` primitives
- **Styling**: Tailwind CSS v4 with `cn()` utility (clsx + tailwind-merge)
- **Fonts**: Geist Sans for UI text, Geist Mono for code/IDs
- **Theme**: Dark mode by default via `next-themes` (`defaultTheme="dark"`)
- **Icons**: `lucide-react` for all icons. Custom SVG icons in `components/icons.tsx` (VercelIcon, AnthropicIcon)

## Adding shadcn Components

```bash
pnpm dlx shadcn@latest add <component>
```

Do not install Radix or base-ui primitives directly. shadcn handles the dependency.

## base-ui Gotchas

This project uses the newer `@base-ui/react` (not legacy `@radix-ui`). Key differences:

### DropdownMenu (Menu)

- `DropdownMenuLabel` wraps `Menu.GroupLabel`, which **must** be inside a `DropdownMenuGroup` (`Menu.Group`). Omitting the group wrapper causes a `MenuGroupRootContext is missing` runtime crash.
- `DropdownMenuTrigger` renders its own `<button>`. Do not wrap it in another `<button>` or use `asChild` with a `<Button>` component - this causes hydration errors from nested buttons.
- The `asChild` prop does not exist on most base-ui components. Style the component directly instead of composing via `asChild`.

```tsx
// Correct: label inside a group
<DropdownMenuContent>
  <DropdownMenuGroup>
    <DropdownMenuLabel>User info</DropdownMenuLabel>
  </DropdownMenuGroup>
  <DropdownMenuSeparator />
  <DropdownMenuItem>Action</DropdownMenuItem>
</DropdownMenuContent>

// Wrong: label without group wrapper (crashes)
<DropdownMenuContent>
  <DropdownMenuLabel>User info</DropdownMenuLabel>
  <DropdownMenuItem>Action</DropdownMenuItem>
</DropdownMenuContent>
```

### Dialog

- Used for the sign-in modal (`components/sign-in-modal.tsx`)
- Dialog components from shadcn work as expected

## Layout Patterns

### Dashboard Shell

The app uses a collapsible sidebar layout:

- **Desktop**: sidebar is a fixed-width panel on the left, content fills the rest
- **Mobile**: sidebar is an overlay triggered by a menu button
- The shell is a client component (`dashboard-shell.tsx`) that manages sidebar open/close state
- The sidebar (`dashboard-sidebar.tsx`) polls sessions every 5 seconds when the user is logged in

### Home Page

Centered vertically and horizontally. Contains:
- Heading: "What do you want Claude to do?"
- Auto-growing textarea with send button
- Subtitle text below

### Chat Page

Full-height scrollable transcript with a sticky bottom composer:
- User messages: dark pill-shaped bubbles, right-aligned text
- Agent messages: plain text, left-aligned
- Tool calls: collapsible sections with monospace payload display
- Composer: backdrop-blur bar pinned to the bottom

## Component Patterns

### Server vs Client Components

- `app/(dashboard)/layout.tsx` is a **Server Component** - it fetches the viewer and sessions from the DB
- `dashboard-shell.tsx`, `dashboard-sidebar.tsx`, `chat-panel.tsx`, `new-chat-composer.tsx` are **Client Components** - they manage state, handle events, and poll APIs
- Push `"use client"` boundaries as far down as possible

### Auth-Aware UI

The sidebar shows different content based on auth state:
- **Signed in**: user avatar, name, dropdown menu with sign-out
- **Signed out**: "Sign in" button that opens `SignInModal`

The home page composer receives `isAuthenticated` as a prop from the server component. If unauthenticated, typing opens the sign-in modal instead of sending a message.

### Sign Out

Sign out uses `authClient.signOut()` from Better Auth's React client with `onSuccess` callback that redirects via `window.location.href = "/"` for a full page reload. Do not use `router.push` for sign-out - the full reload ensures all client state is cleared.

## Styling Rules

- Dark mode is the default. Design with dark backgrounds first.
- Use `text-muted-foreground` for secondary text, `text-foreground` for primary.
- Use `bg-muted` and `bg-muted/50` for subtle backgrounds and hover states.
- Use `border-border` for borders. Most surfaces use `ring-1 ring-border` rather than `border`.
- Rounded corners: `rounded-lg` for cards and containers, `rounded-md` for buttons and inputs, `rounded-full` for avatars and pills.
- Transitions: `transition-colors` on interactive elements for hover/focus states.

## Taste Preferences (Captured)

- Use the Vercel logo/icon in the sidebar header, not Anthropic
- Match the vercel-opencode aesthetic: clean, minimal, dark
- No heavy gradients or glassmorphism
- User messages in dark bubbles, agent messages as plain text
- Tool calls should be collapsible, not always expanded
