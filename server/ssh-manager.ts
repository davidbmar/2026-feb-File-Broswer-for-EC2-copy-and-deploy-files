import { Client as SSHClient, SFTPWrapper, type ConnectConfig, type FileEntry as SSH2FileEntry, type Stats } from "ssh2";
import path from "path";

interface SSHConnection {
  id: string;
  client: SSHClient;
  sftp: SFTPWrapper;
  config: { host: string; port: number; username: string };
  lastUsed: number;
}

// PEM keys stored in memory only (never written to disk)
const pemKeys: Map<string, Buffer> = new Map();

// Active SSH connections keyed by connectionId ("left" / "right")
const connections: Map<string, SSHConnection> = new Map();

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Idle timeout checker
setInterval(() => {
  const now = Date.now();
  connections.forEach((conn, id) => {
    if (now - conn.lastUsed > IDLE_TIMEOUT_MS) {
      console.log(`[ssh-manager] Disconnecting idle connection: ${id}`);
      disconnect(id);
    }
  });
}, 5 * 60 * 1000); // Check every 5 minutes

export function storePemKey(connectionId: string, pemBuffer: Buffer): void {
  pemKeys.set(connectionId, pemBuffer);
}

export function hasPemKey(connectionId: string): boolean {
  return pemKeys.has(connectionId);
}

export async function connect(
  connectionId: string,
  config: { host: string; port: number; username: string }
): Promise<void> {
  // Close existing connection if any
  if (connections.has(connectionId)) {
    disconnect(connectionId);
  }

  const privateKey = pemKeys.get(connectionId);
  if (!privateKey) {
    throw new Error("No PEM key uploaded for this connection. Upload a .pem file first.");
  }

  const client = new SSHClient();

  await new Promise<void>((resolve, reject) => {
    client.on("ready", () => resolve());
    client.on("error", (err) => reject(err));
    client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      privateKey,
      readyTimeout: 10000,
    });
  });

  const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });

  // Auto-cleanup on disconnect
  client.on("close", () => {
    connections.delete(connectionId);
    console.log(`[ssh-manager] Connection closed: ${connectionId}`);
  });

  client.on("error", (err) => {
    console.error(`[ssh-manager] Connection error for ${connectionId}:`, err.message);
    connections.delete(connectionId);
  });

  connections.set(connectionId, {
    id: connectionId,
    client,
    sftp,
    config,
    lastUsed: Date.now(),
  });

  console.log(`[ssh-manager] Connected: ${connectionId} -> ${config.username}@${config.host}:${config.port}`);
}

export function getConnection(connectionId: string): SSHConnection | undefined {
  const conn = connections.get(connectionId);
  if (conn) {
    conn.lastUsed = Date.now();
  }
  return conn;
}

export function getSftp(connectionId: string): SFTPWrapper {
  const conn = getConnection(connectionId);
  if (!conn) {
    throw new Error(`SSH connection "${connectionId}" is not established. Connect first.`);
  }
  return conn.sftp;
}

export function getClient(connectionId: string): SSHClient {
  const conn = getConnection(connectionId);
  if (!conn) {
    throw new Error(`SSH connection "${connectionId}" is not established. Connect first.`);
  }
  return conn.client;
}

export function getConnectionConfig(connectionId: string): { host: string; port: number; username: string } | undefined {
  return connections.get(connectionId)?.config;
}

export function isConnected(connectionId: string): boolean {
  return connections.has(connectionId);
}

export function disconnect(connectionId: string): void {
  const conn = connections.get(connectionId);
  if (conn) {
    try {
      conn.client.end();
    } catch {}
    connections.delete(connectionId);
    console.log(`[ssh-manager] Disconnected: ${connectionId}`);
  }
}

export function disconnectAll(): void {
  Array.from(connections.keys()).forEach((id) => disconnect(id));
}

// --- SFTP Promise Wrappers ---

export function sftpReaddir(sftp: SFTPWrapper, dirPath: string): Promise<SSH2FileEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(dirPath, (err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
}

export function sftpStat(sftp: SFTPWrapper, filePath: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(filePath, (err, stats) => {
      if (err) reject(err);
      else resolve(stats);
    });
  });
}

export function sftpUnlink(sftp: SFTPWrapper, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.unlink(filePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function sftpRename(sftp: SFTPWrapper, oldPath: string, newPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function sftpMkdir(sftp: SFTPWrapper, dirPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.mkdir(dirPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function sftpReadFile(sftp: SFTPWrapper, filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export function sftpWriteFile(sftp: SFTPWrapper, filePath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(filePath);
    stream.on("close", () => resolve());
    stream.on("error", reject);
    stream.end(data);
  });
}

// Run a command on the remote host and return stdout
export function sshExec(client: SSHClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      stream.on("close", (code: number) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Command exited with code ${code}: ${stderr || stdout}`));
      });
    });
  });
}

// Escape a path for safe use in shell commands
export function shellEscape(str: string): string {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}
