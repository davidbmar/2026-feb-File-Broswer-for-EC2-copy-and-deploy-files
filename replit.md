# Remote EC2 Dev UI

A web-based development environment UI featuring a file browser, interactive terminal, and file transfer capabilities. Currently works with the local filesystem with connection settings for future EC2 integration.

## Overview

This application provides a remote development experience with:
- **File Browser Panel** - Navigate directories, view metadata, search/filter files, context menu operations
- **Terminal Panel** - Interactive shell with vim support, multiple sessions, WebSocket PTY streaming
- **Transfer Panel** - Drag-and-drop file upload with progress tracking, directory download as zip
- **Connection Settings** - Upload .pem file and enter EC2 credentials for future connection

## Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, shadcn/ui components
- **Terminal**: xterm.js (@xterm/xterm) for terminal rendering
- **Backend**: Express.js with WebSocket for terminal streaming
- **State Management**: TanStack Query for server state
- **Styling**: Dark-mode optimized dev-tools theme

## Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── file-browser.tsx     # Directory listing and file operations
│   │   ├── terminal-panel.tsx   # xterm.js terminal with WebSocket
│   │   ├── transfer-panel.tsx   # File upload/download UI
│   │   ├── connection-settings.tsx  # EC2 connection config dialog
│   │   └── theme-provider.tsx   # Dark/light mode toggle
│   ├── pages/
│   │   └── home.tsx             # Main layout with resizable panels
│   └── App.tsx                  # Router and providers
server/
├── routes.ts                    # API endpoints and WebSocket terminal
├── index.ts                     # Express server setup
└── storage.ts                   # Storage interface (unused for now)
shared/
└── schema.ts                    # TypeScript interfaces for FileEntry, TransferProgress, etc.
```

## API Endpoints

- `GET /api/files?path=` - List directory contents
- `DELETE /api/files?path=` - Delete file or directory
- `PATCH /api/files/rename` - Rename file or directory
- `POST /api/files/mkdir` - Create directory
- `POST /api/upload` - Upload file (multipart form data)
- `GET /api/download?path=` - Download file or directory (zip for folders)
- `WS /ws/terminal?session=` - WebSocket terminal connection

## Running the Application

The application runs on port 5000 with `npm run dev`. The frontend and backend are served from the same server.

## Features

### File Browser
- Directory tree navigation with breadcrumbs
- File search/filter
- Context menu with: Open in Vim, Copy Path, Download, Rename, Delete
- New folder creation
- Upload button to open transfer panel

### Terminal
- Multiple terminal sessions (tabs)
- Full xterm.js integration with 256-color support
- "Open in Vim" opens files directly in terminal
- Maximize/minimize terminal panel
- JetBrains Mono font for code

### File Transfer
- Drag-and-drop file upload
- Progress bars with status indicators
- Directory download as zip archive
- Transfer history with completion status

### Connection Settings
- EC2 host/username/port configuration
- .pem file upload for SSH key
- Visual connection status indicator
- Settings stored in component state (ready for backend integration)

## Design Decisions

- Dark mode by default for developer comfort
- Resizable panels for flexible workspace layout
- Mobile-responsive with bottom tab navigation
- File icons color-coded by file type
- Terminal uses GitHub dark theme colors
