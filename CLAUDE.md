# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A web-based dual-pane file browser with integrated terminal, built for file management on EC2 instances. React + Express full-stack monorepo with WebSocket terminal support. Currently operates on the local filesystem only (SSH/remote access is stubbed but not implemented).

## Commands

```bash
npm run dev          # Start dev server with Vite HMR at http://localhost:5000
npm run build        # Production build (Vite client → dist/public, esbuild server → dist/index.cjs)
npm run start        # Run production build (requires NODE_ENV=production)
npm run check        # TypeScript type checking (tsc)
```

No test runner is configured. No linter is configured.

## Architecture

**Three-part monorepo:**
- `client/` — React 18 SPA with TailwindCSS and shadcn/ui components
- `server/` — Express 5 backend with WebSocket terminal streaming
- `shared/` — Zod schemas and TypeScript interfaces shared between client/server

**Build pipeline** (`script/build.ts`): Vite builds the client into `dist/public`, esbuild bundles the server into `dist/index.cjs` with selective dependency bundling.

**Server runs on port 5000** (or `PORT` env var), binding to `0.0.0.0`.

### Key Files

- `server/routes.ts` — All API endpoints and WebSocket handler (the entire backend logic)
- `client/src/components/file-browser.tsx` — Main dual-pane file browser component (~800 lines, handles multi-select, drag-drop, context menus)
- `client/src/pages/home.tsx` — Page layout managing left/right panel state (`PanelConfig` objects)
- `shared/schema.ts` — Type contracts: `FileEntry`, `DirectoryListing`, `ConnectionConfig`, `PanelConfig`, `TransferProgress`
- `client/src/components/terminal-panel.tsx` — xterm.js terminal with WebSocket session management

### API Endpoints

File operations use path query params or JSON bodies:
- `GET /api/files?path=` — List directory → `FileEntry[]`
- `GET /api/files/read?path=` — Read file content (max 1MB)
- `DELETE /api/files?path=` — Delete file/directory
- `PATCH /api/files/rename` — `{oldPath, newPath}`
- `POST /api/files/mkdir` — `{path}`
- `POST /api/files/copy` — `{sources: string[], destination: string}`
- `POST /api/files/move` — `{sources: string[], destination: string}`
- `POST /api/upload` — Multipart upload (100MB limit)
- `GET /api/download?path=` — Download file or zip directory
- `WS /ws/terminal?session={id}` — Terminal streaming (base64 encoded)

### Frontend Patterns

- **Routing**: Wouter (single route `/` → Home)
- **Server state**: TanStack React Query
- **Styling**: TailwindCSS utilities + CSS variables for theming (dark/light via next-themes)
- **UI components**: shadcn/ui in `client/src/components/ui/` (Radix UI primitives)
- **Icons**: Lucide React

### Security

`normalizePath()` in `server/routes.ts` enforces path traversal protection, symlink validation, and relative path boundary checks on all file operations.

## Deployment

Configured for Replit autoscale deployment (`.replit`). Build produces a self-contained `dist/` directory. Port mapping: 5000 → 80.

## Unused/Stubbed Features

- Drizzle ORM + PostgreSQL configured (`drizzle.config.ts`) but not wired up
- SSH connection settings UI exists but remote access is not implemented
- Passport auth packages are installed but not used
