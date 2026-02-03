import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import archiver from "archiver";
import { log } from "./index";

const WORKSPACE_ROOT = process.cwd();

async function normalizePath(inputPath: string): Promise<string> {
  // Handle root path
  if (!inputPath || inputPath === "/" || inputPath === "") {
    return WORKSPACE_ROOT;
  }
  
  // Remove leading slash and normalize
  let cleanPath = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  cleanPath = path.normalize(cleanPath);
  
  // Join with workspace root
  const resolved = path.resolve(WORKSPACE_ROOT, cleanPath);
  
  // Security check - use path.relative for robust boundary check
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  
  // If relative path starts with ".." or is absolute, it's outside workspace
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed");
  }
  
  // Additional check: ensure resolved path starts with workspace root + separator
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error("Path traversal not allowed");
  }
  
  // Check for symlinks - resolve real path and verify still within workspace
  try {
    const realPath = await fs.promises.realpath(resolved);
    const realRelative = path.relative(WORKSPACE_ROOT, realPath);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error("Symlink traversal not allowed");
    }
    return realPath;
  } catch (err: any) {
    // File may not exist yet (for mkdir/upload), return resolved path
    if (err.code === "ENOENT") {
      return resolved;
    }
    throw err;
  }
}

function toRelativePath(absolutePath: string): string {
  const relative = path.relative(WORKSPACE_ROOT, absolutePath);
  return "/" + (relative || "");
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  permissions: string;
}

async function listDirectory(dirPath: string): Promise<{
  path: string;
  entries: FileEntry[];
  parent: string | null;
}> {
  const absolutePath = await normalizePath(dirPath);
  const entries: FileEntry[] = [];

  const items = await fs.promises.readdir(absolutePath, { withFileTypes: true });

  for (const item of items) {
    if (item.name.startsWith(".")) continue;

    const itemPath = path.join(absolutePath, item.name);
    try {
      const stat = await fs.promises.stat(itemPath);
      entries.push({
        name: item.name,
        path: toRelativePath(itemPath),
        isDirectory: item.isDirectory(),
        size: stat.size,
        modified: stat.mtime.toISOString(),
        permissions: (stat.mode & 0o777).toString(8),
      });
    } catch (error) {
      // Skip files we can't access
    }
  }

  const relativePath = toRelativePath(absolutePath);
  const parentPath = relativePath === "/" ? null : toRelativePath(path.dirname(absolutePath));

  return {
    path: relativePath,
    entries,
    parent: parentPath,
  };
}

function normalizePathSync(inputPath: string): string {
  if (!inputPath || inputPath === "/" || inputPath === "") {
    return WORKSPACE_ROOT;
  }
  let cleanPath = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  cleanPath = path.normalize(cleanPath);
  const resolved = path.resolve(WORKSPACE_ROOT, cleanPath);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal not allowed");
  }
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const destPath = req.body.path || "/";
      try {
        const absolutePath = normalizePathSync(destPath);
        cb(null, absolutePath);
      } catch (error) {
        cb(error as Error, "");
      }
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

const terminalSessions: Map<string, ChildProcessWithoutNullStreams> = new Map();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // List directory
  app.get("/api/files", async (req, res) => {
    try {
      const dirPath = (req.query.path as string) || "/";
      const listing = await listDirectory(dirPath);
      res.json(listing);
    } catch (error) {
      log(`Error listing directory: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Delete file or directory
  app.delete("/api/files", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      const absolutePath = await normalizePath(filePath);
      const stat = await fs.promises.stat(absolutePath);

      if (stat.isDirectory()) {
        await fs.promises.rm(absolutePath, { recursive: true });
      } else {
        await fs.promises.unlink(absolutePath);
      }

      res.json({ success: true });
    } catch (error) {
      log(`Error deleting file: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Rename file or directory
  app.patch("/api/files/rename", async (req, res) => {
    try {
      const { oldPath, newPath } = req.body;
      if (!oldPath || !newPath) {
        return res.status(400).json({ error: "oldPath and newPath are required" });
      }

      const absoluteOldPath = await normalizePath(oldPath);
      const absoluteNewPath = await normalizePath(newPath);

      await fs.promises.rename(absoluteOldPath, absoluteNewPath);
      res.json({ success: true });
    } catch (error) {
      log(`Error renaming file: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Create directory
  app.post("/api/files/mkdir", async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      if (!dirPath) {
        return res.status(400).json({ error: "Path is required" });
      }

      const absolutePath = await normalizePath(dirPath);
      await fs.promises.mkdir(absolutePath, { recursive: true });
      res.json({ success: true });
    } catch (error) {
      log(`Error creating directory: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Copy files
  app.post("/api/files/copy", async (req, res) => {
    try {
      const { sources, destination } = req.body;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: "Sources array is required" });
      }
      if (!destination) {
        return res.status(400).json({ error: "Destination path is required" });
      }

      const destPath = await normalizePath(destination);
      const destStat = await fs.promises.stat(destPath);
      if (!destStat.isDirectory()) {
        return res.status(400).json({ error: "Destination must be a directory" });
      }

      const results: { source: string; dest: string; success: boolean; error?: string }[] = [];

      for (const source of sources) {
        try {
          const sourcePath = await normalizePath(source);
          const fileName = path.basename(sourcePath);
          const targetPath = path.join(destPath, fileName);

          const sourceStat = await fs.promises.stat(sourcePath);
          if (sourceStat.isDirectory()) {
            await fs.promises.cp(sourcePath, targetPath, { recursive: true });
          } else {
            await fs.promises.copyFile(sourcePath, targetPath);
          }
          results.push({ source, dest: toRelativePath(targetPath), success: true });
        } catch (err) {
          results.push({ source, dest: "", success: false, error: (err as Error).message });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      log(`Error copying files: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Move files (copy then delete source)
  app.post("/api/files/move", async (req, res) => {
    try {
      const { sources, destination } = req.body;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: "Sources array is required" });
      }
      if (!destination) {
        return res.status(400).json({ error: "Destination path is required" });
      }

      const destPath = await normalizePath(destination);
      const destStat = await fs.promises.stat(destPath);
      if (!destStat.isDirectory()) {
        return res.status(400).json({ error: "Destination must be a directory" });
      }

      const results: { source: string; dest: string; success: boolean; error?: string }[] = [];

      for (const source of sources) {
        try {
          const sourcePath = await normalizePath(source);
          const fileName = path.basename(sourcePath);
          const destFilePath = path.join(destPath, fileName);

          // Use rename for move (atomic on same filesystem, falls back to copy+delete)
          await fs.promises.rename(sourcePath, destFilePath);

          results.push({
            source,
            dest: toRelativePath(destFilePath),
            success: true,
          });
        } catch (err) {
          results.push({
            source,
            dest: "",
            success: false,
            error: (err as Error).message,
          });
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      log(`Error moving files: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Read file contents
  app.get("/api/files/read", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      const absolutePath = await normalizePath(filePath);
      const stat = await fs.promises.stat(absolutePath);
      
      if (stat.isDirectory()) {
        return res.status(400).json({ error: "Cannot read a directory" });
      }

      // Limit file size to 1MB for preview
      if (stat.size > 1024 * 1024) {
        return res.status(400).json({ error: "File too large to preview (max 1MB)" });
      }

      const content = await fs.promises.readFile(absolutePath, "utf-8");
      res.json({
        path: filePath,
        content,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    } catch (error) {
      log(`Error reading file: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Upload file
  app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({
      success: true,
      path: toRelativePath(req.file.path),
      filename: req.file.originalname,
      size: req.file.size,
    });
  });

  // Download file or directory
  app.get("/api/download", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      const absolutePath = await normalizePath(filePath);
      const stat = await fs.promises.stat(absolutePath);

      if (stat.isDirectory()) {
        // Create a zip archive for directories
        const archive = archiver("zip", { zlib: { level: 9 } });
        const dirName = path.basename(absolutePath);

        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${dirName}.zip"`
        );

        archive.pipe(res);
        archive.directory(absolutePath, dirName);
        await archive.finalize();
      } else {
        // Send file directly
        const fileName = path.basename(absolutePath);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName}"`
        );
        res.sendFile(absolutePath);
      }
    } catch (error) {
      log(`Error downloading file: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // WebSocket for terminal
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/terminal" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("session") || "default";

    log(`Terminal session started: ${sessionId}`);

    // Kill existing session if any
    const existingProcess = terminalSessions.get(sessionId);
    if (existingProcess) {
      existingProcess.kill();
      terminalSessions.delete(sessionId);
    }

    // Spawn a login shell - vim may have limited support without full PTY
    const shell = spawn("/bin/bash", ["-l", "-i"], {
      cwd: WORKSPACE_ROOT,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        SHELL: "/bin/bash",
      },
      shell: false,
    });

    terminalSessions.set(sessionId, shell);

    shell.stdout.on("data", (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data.toString());
      }
    });

    shell.stderr.on("data", (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data.toString());
      }
    });

    shell.on("close", (code) => {
      log(`Terminal session ended: ${sessionId} with code ${code}`);
      terminalSessions.delete(sessionId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on("message", (message) => {
      const data = message.toString();

      // Check for resize command
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "resize") {
          // We can't resize without a real PTY, but we acknowledge the message
          return;
        }
      } catch {
        // Not JSON, treat as terminal input
      }

      if (shell.stdin.writable) {
        shell.stdin.write(data);
      }
    });

    ws.on("close", () => {
      log(`WebSocket closed for session: ${sessionId}`);
      shell.kill();
      terminalSessions.delete(sessionId);
    });

    ws.on("error", (error) => {
      log(`WebSocket error for session ${sessionId}: ${error}`);
      shell.kill();
      terminalSessions.delete(sessionId);
    });
  });

  return httpServer;
}
