# Remote EC2 Dev UI

A web-based development environment UI featuring dual-pane file browsers, interactive terminal, and drag-and-drop file transfer between panels. Currently works with the local filesystem with connection settings for future EC2 integration.

## Overview

This application provides a remote development experience with:
- **Dual-Pane File Browser** - Two side-by-side file panels, each configurable for local or SSH
- **Multi-Select & Drag-Drop** - Select files and drag them to the other panel to transfer
- **Collapsible Panels** - Minimize left or right panel to focus on one side
- **Terminal Panel** - Interactive shell with vim support, multiple sessions
- **Connection Settings** - Configure SSH for each panel independently

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, shadcn/ui components
- **Terminal**: xterm.js (@xterm/xterm) for terminal rendering
- **Backend**: Express.js with WebSocket for terminal streaming
- **State Management**: TanStack Query for server state
- **Styling**: Dark/Light mode with dev-tools theme

## Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── file-browser.tsx     # Dual-pane file browser with drag-drop
│   │   ├── terminal-panel.tsx   # xterm.js terminal with WebSocket
│   │   ├── transfer-panel.tsx   # File upload/download UI (legacy)
│   │   ├── connection-settings.tsx  # SSH connection config dialog
│   │   └── theme-provider.tsx   # Dark/light mode toggle
│   ├── pages/
│   │   └── home.tsx             # Main layout with dual panels
│   └── App.tsx                  # Router and providers
server/
├── routes.ts                    # API endpoints and WebSocket terminal
├── index.ts                     # Express server setup
└── storage.ts                   # Storage interface (unused for now)
shared/
└── schema.ts                    # TypeScript interfaces for FileEntry, PanelConfig, etc.
```

## API Endpoints

- `GET /api/files?path=` - List directory contents
- `DELETE /api/files?path=` - Delete file or directory
- `PATCH /api/files/rename` - Rename file or directory
- `POST /api/files/mkdir` - Create directory
- `POST /api/files/copy` - Copy files between directories
- `POST /api/upload` - Upload file (multipart form data)
- `GET /api/download?path=` - Download file or directory (zip for folders)
- `WS /ws/terminal?session=` - WebSocket terminal connection

## Running the Application

The application runs on port 5000 with `npm run dev`. The frontend and backend are served from the same server.

## Features

### Dual-Pane File Browser
- Two file browser panels side by side
- Each panel independently configurable: Local or SSH remote
- Click to select files, Ctrl/Cmd+click for multi-select
- Drag files from one panel to drop on the other for transfer
- Minimize/expand each panel with collapse buttons
- Directory navigation with breadcrumbs
- File search/filter
- Context menu: Open in Vim, Copy Path, Download, Rename, Delete

### Terminal
- Multiple terminal sessions (tabs)
- Full xterm.js integration with 256-color support
- "Open in Vim" opens files directly in terminal
- Maximize/minimize terminal panel
- JetBrains Mono font for code

### Connection Settings (per panel)
- Switch between Local filesystem and SSH
- EC2 host/username/port configuration
- .pem file upload for SSH key
- Visual connection status indicator

## Design Decisions

- Dark/Light mode toggle in header
- Resizable vertical panels (files on top, terminal on bottom)
- Dual-pane horizontal layout for file management
- File icons color-coded by file type
- Selection indicators for multi-select
- Drag-and-drop visual feedback with highlighted drop zones
