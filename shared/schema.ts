import { z } from "zod";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: string;
  permissions: string;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
  parent: string | null;
}

export interface ConnectionConfig {
  id: string;
  host: string;
  username: string;
  port: number;
  pemFileName?: string;
  connected: boolean;
}

export const connectionConfigSchema = z.object({
  host: z.string().min(1, "Host is required"),
  username: z.string().min(1, "Username is required"),
  port: z.number().min(1).max(65535).default(22),
});

export type InsertConnectionConfig = z.infer<typeof connectionConfigSchema>;

export interface TerminalSession {
  id: string;
  active: boolean;
}

export interface TransferProgress {
  id: string;
  filename: string;
  progress: number;
  total: number;
  type: "upload" | "download";
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
}

export interface PanelConfig {
  id: "left" | "right";
  isLocal: boolean;
  connection: ConnectionConfig | null;
  currentPath: string;
  isMinimized: boolean;
  selectedFiles: FileEntry[];
}
