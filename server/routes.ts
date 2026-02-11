import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import multer from "multer";
import archiver from "archiver";
import { log } from "./index";
import * as sshManager from "./ssh-manager";

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

async function listDirectoryRemote(connectionId: string, dirPath: string): Promise<{
  path: string;
  entries: FileEntry[];
  parent: string | null;
}> {
  const sftp = sshManager.getSftp(connectionId);
  const config = sshManager.getConnectionConfig(connectionId);

  // Default to home directory
  let remotePath = dirPath;
  if (!dirPath || dirPath === "/") {
    remotePath = config ? `/home/${config.username}` : "/";
  }

  const rawEntries = await sshManager.sftpReaddir(sftp, remotePath);
  const entries: FileEntry[] = [];

  for (const item of rawEntries) {
    if (item.filename.startsWith(".")) continue;
    const isDir = (item.attrs.mode & 0o40000) !== 0;
    entries.push({
      name: item.filename,
      path: path.posix.join(remotePath, item.filename),
      isDirectory: isDir,
      size: item.attrs.size,
      modified: new Date((item.attrs.mtime || 0) * 1000).toISOString(),
      permissions: (item.attrs.mode & 0o777).toString(8),
    });
  }

  const parent = remotePath === "/" ? null : path.posix.dirname(remotePath);

  return {
    path: remotePath,
    entries,
    parent,
  };
}

async function uploadDirToRemote(localDir: string, remoteDir: string, sftp: import("ssh2").SFTPWrapper, client: import("ssh2").Client): Promise<void> {
  await sshManager.sshExec(client, `mkdir -p ${sshManager.shellEscape(remoteDir)}`);
  const items = await fs.promises.readdir(localDir, { withFileTypes: true });
  for (const item of items) {
    const localPath = path.join(localDir, item.name);
    const remotePath = path.posix.join(remoteDir, item.name);
    if (item.isDirectory()) {
      await uploadDirToRemote(localPath, remotePath, sftp, client);
    } else {
      const data = await fs.promises.readFile(localPath);
      await sshManager.sftpWriteFile(sftp, remotePath, data);
    }
  }
}

async function downloadDirFromRemote(remoteDir: string, localDir: string, sftp: import("ssh2").SFTPWrapper): Promise<void> {
  await fs.promises.mkdir(localDir, { recursive: true });
  const items = await sshManager.sftpReaddir(sftp, remoteDir);
  for (const item of items) {
    const remotePath = path.posix.join(remoteDir, item.filename);
    const localPath = path.join(localDir, item.filename);
    if ((item.attrs.mode & 0o40000) !== 0) {
      await downloadDirFromRemote(remotePath, localPath, sftp);
    } else {
      const data = await sshManager.sftpReadFile(sftp, remotePath);
      await fs.promises.writeFile(localPath, data);
    }
  }
}

const pemUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 } });
const remoteUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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
  // --- SSH Management Endpoints ---

  // Upload PEM key
  app.post("/api/ssh/upload-key", pemUpload.single("pemFile"), (req, res) => {
    try {
      const connectionId = req.body.connectionId;
      if (!connectionId || !req.file) {
        return res.status(400).json({ error: "connectionId and pemFile are required" });
      }
      sshManager.storePemKey(connectionId, req.file.buffer);
      res.json({ success: true, connectionId, fileName: req.file.originalname });
    } catch (error) {
      log(`Error uploading PEM key: ${error}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Establish SSH connection
  app.post("/api/ssh/connect", async (req, res) => {
    try {
      const { connectionId, host, port, username } = req.body;
      if (!connectionId || !host || !username) {
        return res.status(400).json({ error: "connectionId, host, and username are required" });
      }
      await sshManager.connect(connectionId, { host, port: port || 22, username });
      res.json({ success: true, connectionId });
    } catch (error) {
      log(`Error connecting SSH: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Disconnect SSH
  app.post("/api/ssh/disconnect", (req, res) => {
    try {
      const { connectionId } = req.body;
      if (!connectionId) {
        return res.status(400).json({ error: "connectionId is required" });
      }
      sshManager.disconnect(connectionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Check SSH connection status
  app.get("/api/ssh/status", (req, res) => {
    const connectionId = req.query.connectionId as string;
    if (!connectionId) {
      return res.status(400).json({ error: "connectionId is required" });
    }
    res.json({
      connected: sshManager.isConnected(connectionId),
      hasPemKey: sshManager.hasPemKey(connectionId),
    });
  });

  // --- File Endpoints (with remote support) ---

  // List directory
  app.get("/api/files", async (req, res) => {
    try {
      const dirPath = (req.query.path as string) || "/";
      const connectionId = req.query.connectionId as string | undefined;

      if (connectionId) {
        const listing = await listDirectoryRemote(connectionId, dirPath);
        return res.json(listing);
      }

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
      const connectionId = req.query.connectionId as string | undefined;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      if (connectionId) {
        const sftp = sshManager.getSftp(connectionId);
        const stat = await sshManager.sftpStat(sftp, filePath);
        if ((stat.mode & 0o40000) !== 0) {
          await sshManager.sshExec(sshManager.getClient(connectionId), `rm -rf ${sshManager.shellEscape(filePath)}`);
        } else {
          await sshManager.sftpUnlink(sftp, filePath);
        }
        return res.json({ success: true });
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
      const { oldPath, newPath, connectionId } = req.body;
      if (!oldPath || !newPath) {
        return res.status(400).json({ error: "oldPath and newPath are required" });
      }

      if (connectionId) {
        const sftp = sshManager.getSftp(connectionId);
        await sshManager.sftpRename(sftp, oldPath, newPath);
        return res.json({ success: true });
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
      const { path: dirPath, connectionId } = req.body;
      if (!dirPath) {
        return res.status(400).json({ error: "Path is required" });
      }

      if (connectionId) {
        const client = sshManager.getClient(connectionId);
        await sshManager.sshExec(client, `mkdir -p ${sshManager.shellEscape(dirPath)}`);
        return res.json({ success: true });
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
      const { sources, destination, connectionId } = req.body;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: "Sources array is required" });
      }
      if (!destination) {
        return res.status(400).json({ error: "Destination path is required" });
      }

      if (connectionId) {
        const client = sshManager.getClient(connectionId);
        const results: { source: string; dest: string; success: boolean; error?: string }[] = [];
        for (const source of sources) {
          try {
            const fileName = path.posix.basename(source);
            const targetPath = path.posix.join(destination, fileName);
            await sshManager.sshExec(client, `cp -r ${sshManager.shellEscape(source)} ${sshManager.shellEscape(targetPath)}`);
            results.push({ source, dest: targetPath, success: true });
          } catch (err) {
            results.push({ source, dest: "", success: false, error: (err as Error).message });
          }
        }
        return res.json({ success: true, results });
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
      const { sources, destination, connectionId } = req.body;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: "Sources array is required" });
      }
      if (!destination) {
        return res.status(400).json({ error: "Destination path is required" });
      }

      if (connectionId) {
        const sftp = sshManager.getSftp(connectionId);
        const results: { source: string; dest: string; success: boolean; error?: string }[] = [];
        for (const source of sources) {
          try {
            const fileName = path.posix.basename(source);
            const destFilePath = path.posix.join(destination, fileName);
            await sshManager.sftpRename(sftp, source, destFilePath);
            results.push({ source, dest: destFilePath, success: true });
          } catch (err) {
            results.push({ source, dest: "", success: false, error: (err as Error).message });
          }
        }
        return res.json({ success: true, results });
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
      const connectionId = req.query.connectionId as string | undefined;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      if (connectionId) {
        const sftp = sshManager.getSftp(connectionId);
        const stat = await sshManager.sftpStat(sftp, filePath);
        if ((stat.mode & 0o40000) !== 0) {
          return res.status(400).json({ error: "Cannot read a directory" });
        }
        if (stat.size > 1024 * 1024) {
          return res.status(400).json({ error: "File too large to preview (max 1MB)" });
        }
        const buffer = await sshManager.sftpReadFile(sftp, filePath);
        return res.json({
          path: filePath,
          content: buffer.toString("utf-8"),
          size: stat.size,
          modified: new Date((stat.mtime || 0) * 1000).toISOString(),
        });
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

  // Upload file to remote via SFTP
  app.post("/api/upload/remote", remoteUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const { connectionId } = req.body;
      const destPath = req.body.path || "/";
      if (!connectionId) {
        return res.status(400).json({ error: "connectionId is required" });
      }
      const sftp = sshManager.getSftp(connectionId);
      const remotePath = path.posix.join(destPath, req.file.originalname);
      await sshManager.sftpWriteFile(sftp, remotePath, req.file.buffer);
      res.json({
        success: true,
        path: remotePath,
        filename: req.file.originalname,
        size: req.file.size,
      });
    } catch (error) {
      log(`Error uploading to remote: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Download file or directory
  app.get("/api/download", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      const connectionId = req.query.connectionId as string | undefined;
      if (!filePath) {
        return res.status(400).json({ error: "Path is required" });
      }

      if (connectionId) {
        const sftp = sshManager.getSftp(connectionId);
        const stat = await sshManager.sftpStat(sftp, filePath);
        const fileName = path.posix.basename(filePath);

        if ((stat.mode & 0o40000) !== 0) {
          // Directory: tar on remote and stream
          const client = sshManager.getClient(connectionId);
          const parentDir = path.posix.dirname(filePath);
          const dirName = path.posix.basename(filePath);
          res.setHeader("Content-Type", "application/gzip");
          res.setHeader("Content-Disposition", `attachment; filename="${dirName}.tar.gz"`);

          client.exec(`tar cz -C ${sshManager.shellEscape(parentDir)} ${sshManager.shellEscape(dirName)}`, (err, stream) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }
            stream.pipe(res);
            stream.on("close", () => res.end());
          });
        } else {
          // File: stream via SFTP
          res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
          const readStream = sftp.createReadStream(filePath);
          readStream.pipe(res);
          readStream.on("error", (err: Error) => {
            if (!res.headersSent) {
              res.status(500).json({ error: err.message });
            }
          });
        }
        return;
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

  // Cross-host file transfer (local <-> remote)
  app.post("/api/files/transfer", async (req, res) => {
    try {
      const { sources, destination, sourceConnectionId, destConnectionId, operation } = req.body;
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        return res.status(400).json({ error: "Sources array is required" });
      }
      if (!destination) {
        return res.status(400).json({ error: "Destination path is required" });
      }

      const results: { source: string; dest: string; success: boolean; error?: string }[] = [];

      for (const source of sources) {
        try {
          const fileName = sourceConnectionId ? path.posix.basename(source) : path.basename(source);
          const targetPath = destConnectionId
            ? path.posix.join(destination, fileName)
            : path.join(await normalizePath(destination), fileName);

          if (!sourceConnectionId && destConnectionId) {
            // Local -> Remote
            const sftp = sshManager.getSftp(destConnectionId);
            const localPath = await normalizePath(source);
            const localStat = await fs.promises.stat(localPath);

            if (localStat.isDirectory()) {
              // Recursive directory upload
              await uploadDirToRemote(localPath, path.posix.join(destination, fileName), sftp, sshManager.getClient(destConnectionId));
            } else {
              const data = await fs.promises.readFile(localPath);
              await sshManager.sftpWriteFile(sftp, targetPath, data);
            }
            results.push({ source, dest: targetPath, success: true });
          } else if (sourceConnectionId && !destConnectionId) {
            // Remote -> Local
            const sftp = sshManager.getSftp(sourceConnectionId);
            const remoteStat = await sshManager.sftpStat(sftp, source);

            if ((remoteStat.mode & 0o40000) !== 0) {
              // Recursive directory download
              await downloadDirFromRemote(source, targetPath, sftp);
            } else {
              const data = await sshManager.sftpReadFile(sftp, source);
              await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
              await fs.promises.writeFile(targetPath, data);
            }
            results.push({ source, dest: toRelativePath(targetPath), success: true });
          } else if (sourceConnectionId && destConnectionId) {
            // Remote -> Remote (stream through server)
            const srcSftp = sshManager.getSftp(sourceConnectionId);
            const destSftp = sshManager.getSftp(destConnectionId);
            const data = await sshManager.sftpReadFile(srcSftp, source);
            await sshManager.sftpWriteFile(destSftp, targetPath, data);
            results.push({ source, dest: targetPath, success: true });
          }
        } catch (err) {
          results.push({ source, dest: "", success: false, error: (err as Error).message });
        }
      }

      // For move operations, delete sources after successful copy
      if (operation === "move") {
        for (const result of results) {
          if (!result.success) continue;
          try {
            if (!sourceConnectionId) {
              const localPath = await normalizePath(result.source);
              await fs.promises.rm(localPath, { recursive: true });
            } else {
              const sftp = sshManager.getSftp(sourceConnectionId);
              const stat = await sshManager.sftpStat(sftp, result.source);
              if ((stat.mode & 0o40000) !== 0) {
                await sshManager.sshExec(sshManager.getClient(sourceConnectionId), `rm -rf ${sshManager.shellEscape(result.source)}`);
              } else {
                await sshManager.sftpUnlink(sftp, result.source);
              }
            }
          } catch {}
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      log(`Error transferring files: ${error}`);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // WebSocket for terminal
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/terminal" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("session") || "default";
    const connectionId = url.searchParams.get("connectionId");

    log(`Terminal session started: ${sessionId}${connectionId ? ` (remote: ${connectionId})` : " (local)"}`);

    if (connectionId) {
      // --- Remote SSH shell ---
      let client: import("ssh2").Client;
      try {
        client = sshManager.getClient(connectionId);
      } catch {
        ws.close(1008, "SSH connection not established");
        return;
      }

      client.shell({ term: "xterm-256color" }, (err, stream) => {
        if (err) {
          log(`SSH shell error: ${err.message}`);
          ws.close(1011, err.message);
          return;
        }

        stream.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data.toString());
          }
        });

        stream.stderr.on("data", (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data.toString());
          }
        });

        stream.on("close", () => {
          log(`SSH shell closed for session: ${sessionId}`);
          if (ws.readyState === WebSocket.OPEN) ws.close();
        });

        ws.on("message", (message) => {
          const data = message.toString();
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "resize" && parsed.cols && parsed.rows) {
              stream.setWindow(parsed.rows, parsed.cols, 0, 0);
              return;
            }
          } catch {}
          stream.write(data);
        });

        ws.on("close", () => {
          log(`WebSocket closed for SSH session: ${sessionId}`);
          stream.close();
        });

        ws.on("error", (error) => {
          log(`WebSocket error for SSH session ${sessionId}: ${error}`);
          stream.close();
        });
      });

      return;
    }

    // --- Local shell ---

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
