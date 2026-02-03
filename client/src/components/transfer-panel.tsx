import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  FolderOpen,
} from "lucide-react";
import type { TransferProgress } from "@shared/schema";

interface TransferPanelProps {
  transfers: TransferProgress[];
  onAddTransfer: (transfer: TransferProgress) => void;
  onRemoveTransfer: (id: string) => void;
  onUpdateTransfer: (id: string, update: Partial<TransferProgress>) => void;
  uploadPath: string;
  onUploadComplete: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getStatusIcon(status: TransferProgress["status"]) {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
  }
}

function getStatusBadge(status: TransferProgress["status"]) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "in_progress":
      return <Badge variant="default">Uploading</Badge>;
    case "completed":
      return <Badge variant="outline" className="text-green-500 border-green-500/50">Complete</Badge>;
    case "error":
      return <Badge variant="destructive">Error</Badge>;
  }
}

export function TransferPanel({
  transfers,
  onAddTransfer,
  onRemoveTransfer,
  onUpdateTransfer,
  uploadPath,
  onUploadComplete,
}: TransferPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await uploadFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async (file: File) => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transfer: TransferProgress = {
      id,
      filename: file.name,
      progress: 0,
      total: file.size,
      type: "upload",
      status: "pending",
    };

    onAddTransfer(transfer);
    onUpdateTransfer(id, { status: "in_progress" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", uploadPath);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onUpdateTransfer(id, { progress: e.loaded });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onUpdateTransfer(id, { status: "completed", progress: file.size });
          onUploadComplete();
        } else {
          onUpdateTransfer(id, { status: "error", error: "Upload failed" });
        }
      });

      xhr.addEventListener("error", () => {
        onUpdateTransfer(id, { status: "error", error: "Network error" });
      });

      xhr.open("POST", "/api/upload");
      xhr.send(formData);
    } catch (error) {
      onUpdateTransfer(id, {
        status: "error",
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  };

  const activeTransfers = transfers.filter((t) => t.status === "in_progress" || t.status === "pending");
  const completedTransfers = transfers.filter((t) => t.status === "completed" || t.status === "error");

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Transfers</span>
        {activeTransfers.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {activeTransfers.length} active
          </Badge>
        )}
      </div>

      <div
        className={`m-3 p-6 border-2 border-dashed rounded-md transition-colors cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/30 hover:border-muted-foreground/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="upload-dropzone"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Upload className="h-8 w-8" />
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs">
            Uploading to: <span className="text-foreground font-mono">{uploadPath}</span>
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-file-upload"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 space-y-2">
          {transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No transfers yet</p>
            </div>
          ) : (
            <>
              {activeTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="p-3 bg-card rounded-md border border-card-border"
                  data-testid={`transfer-${transfer.id}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {transfer.type === "upload" ? (
                      <Upload className="h-4 w-4 text-primary" />
                    ) : (
                      <Download className="h-4 w-4 text-green-500" />
                    )}
                    <span className="flex-1 text-sm font-medium truncate">
                      {transfer.filename}
                    </span>
                    {getStatusIcon(transfer.status)}
                  </div>
                  <Progress
                    value={(transfer.progress / transfer.total) * 100}
                    className="h-1.5"
                  />
                  <div className="flex items-center justify-between mt-2 text-2xs text-muted-foreground">
                    <span>
                      {formatBytes(transfer.progress)} / {formatBytes(transfer.total)}
                    </span>
                    <span>{Math.round((transfer.progress / transfer.total) * 100)}%</span>
                  </div>
                </div>
              ))}

              {completedTransfers.length > 0 && (
                <>
                  {activeTransfers.length > 0 && (
                    <div className="text-xs text-muted-foreground py-2">Recent transfers</div>
                  )}
                  {completedTransfers.slice(0, 10).map((transfer) => (
                    <div
                      key={transfer.id}
                      className="flex items-center gap-2 p-2 rounded-md hover-elevate group"
                      data-testid={`transfer-complete-${transfer.id}`}
                    >
                      {transfer.type === "upload" ? (
                        <Upload className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Download className="h-3 w-3 text-muted-foreground" />
                      )}
                      <span className="flex-1 text-xs truncate">{transfer.filename}</span>
                      {getStatusIcon(transfer.status)}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100"
                        onClick={() => onRemoveTransfer(transfer.id)}
                        data-testid={`button-remove-transfer-${transfer.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
