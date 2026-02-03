import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileJson,
  Image,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Home,
  ArrowUp,
  FolderPlus,
  Upload,
  Download,
  Trash2,
  Edit3,
  Terminal,
  Copy,
} from "lucide-react";
import type { FileEntry, DirectoryListing } from "@shared/schema";

interface FileBrowserProps {
  onOpenInTerminal: (path: string) => void;
  onDownload: (path: string) => void;
  onUpload: (path: string) => void;
  currentPath: string;
  setCurrentPath: (path: string) => void;
}

function getFileIcon(entry: FileEntry) {
  if (entry.isDirectory) {
    return <Folder className="h-4 w-4 text-amber-400" />;
  }
  const ext = entry.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return <FileCode className="h-4 w-4 text-blue-400" />;
    case "json":
      return <FileJson className="h-4 w-4 text-yellow-400" />;
    case "md":
    case "txt":
      return <FileText className="h-4 w-4 text-gray-400" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return <Image className="h-4 w-4 text-pink-400" />;
    case "css":
    case "scss":
      return <FileCode className="h-4 w-4 text-purple-400" />;
    case "html":
      return <FileCode className="h-4 w-4 text-orange-400" />;
    case "py":
      return <FileCode className="h-4 w-4 text-green-400" />;
    default:
      return <File className="h-4 w-4 text-gray-400" />;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

export function FileBrowser({
  onOpenInTerminal,
  onDownload,
  onUpload,
  currentPath,
  setCurrentPath,
}: FileBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const { data: listing, isLoading, refetch } = useQuery<DirectoryListing>({
    queryKey: ["/api/files", currentPath],
  });

  const deleteMutation = useMutation({
    mutationFn: async (path: string) => {
      await apiRequest("DELETE", `/api/files?path=${encodeURIComponent(path)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", currentPath] });
      setDeleteDialogOpen(false);
      setSelectedFile(null);
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      await apiRequest("PATCH", "/api/files/rename", { oldPath, newPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", currentPath] });
      setRenameDialogOpen(false);
      setNewName("");
      setSelectedFile(null);
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      await apiRequest("POST", "/api/files/mkdir", { path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", currentPath] });
      setNewFolderDialogOpen(false);
      setNewFolderName("");
    },
  });

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
    setSearchQuery("");
  }, [setCurrentPath]);

  const handleDoubleClick = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      handleNavigate(entry.path);
    } else {
      onOpenInTerminal(entry.path);
    }
  }, [handleNavigate, onOpenInTerminal]);

  const handleRename = () => {
    if (selectedFile && newName) {
      const parentPath = selectedFile.path.substring(0, selectedFile.path.lastIndexOf("/"));
      const newPath = `${parentPath}/${newName}`;
      renameMutation.mutate({ oldPath: selectedFile.path, newPath });
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName) {
      const path = currentPath === "/" ? `/${newFolderName}` : `${currentPath}/${newFolderName}`;
      createFolderMutation.mutate(path);
    }
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
  };

  const filteredEntries = listing?.entries.filter((entry) =>
    entry.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedEntries = filteredEntries?.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => handleNavigate("/")}
          data-testid="button-home"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => listing?.parent && handleNavigate(listing.parent)}
          disabled={!listing?.parent}
          data-testid="button-up"
          title="Go up"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 flex-1 min-w-0 text-sm" data-testid="breadcrumb-navigation">
          <span
            className="text-muted-foreground cursor-pointer hover:text-foreground"
            onClick={() => handleNavigate("/")}
            data-testid="breadcrumb-root"
          >
            /
          </span>
          {breadcrumbs.map((segment, index) => (
            <span key={index} className="flex items-center gap-1 min-w-0">
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span
                className="truncate cursor-pointer hover:text-foreground text-muted-foreground"
                onClick={() =>
                  handleNavigate("/" + breadcrumbs.slice(0, index + 1).join("/"))
                }
                data-testid={`breadcrumb-segment-${segment}`}
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => refetch()}
          data-testid="button-refresh"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 p-3 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 bg-muted/50"
            data-testid="input-search"
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setNewFolderDialogOpen(true)}
          data-testid="button-new-folder"
          title="New folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onUpload(currentPath)}
          data-testid="button-upload"
          title="Upload"
        >
          <Upload className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : sortedEntries?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Folder className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No files found</p>
          </div>
        ) : (
          <div className="p-1">
            {sortedEntries?.map((entry) => (
              <ContextMenu key={entry.path}>
                <ContextMenuTrigger>
                  <div
                    className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                      selectedFile?.path === entry.path
                        ? "bg-accent"
                        : "hover-elevate"
                    }`}
                    onClick={() => setSelectedFile(entry)}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    data-testid={`file-entry-${entry.name}`}
                  >
                    {getFileIcon(entry)}
                    <span className="flex-1 truncate text-sm">{entry.name}</span>
                    <span className="text-2xs text-muted-foreground w-16 text-right">
                      {entry.isDirectory ? "--" : formatFileSize(entry.size)}
                    </span>
                    <span className="text-2xs text-muted-foreground w-20 text-right">
                      {formatDate(entry.modified)}
                    </span>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {!entry.isDirectory && (
                    <>
                      <ContextMenuItem 
                        onClick={() => onOpenInTerminal(entry.path)}
                        data-testid={`context-open-vim-${entry.name}`}
                      >
                        <Terminal className="h-4 w-4 mr-2" />
                        Open in Vim
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                    </>
                  )}
                  {entry.isDirectory && (
                    <ContextMenuItem 
                      onClick={() => handleNavigate(entry.path)}
                      data-testid={`context-open-folder-${entry.name}`}
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      Open
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem 
                    onClick={() => copyPath(entry.path)}
                    data-testid={`context-copy-path-${entry.name}`}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Path
                  </ContextMenuItem>
                  <ContextMenuItem 
                    onClick={() => onDownload(entry.path)}
                    data-testid={`context-download-${entry.name}`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      setSelectedFile(entry);
                      setNewName(entry.name);
                      setRenameDialogOpen(true);
                    }}
                    data-testid={`context-rename-${entry.name}`}
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={() => {
                      setSelectedFile(entry);
                      setDeleteDialogOpen(true);
                    }}
                    data-testid={`context-delete-${entry.name}`}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFile?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              {selectedFile?.isDirectory ? "this folder and all its contents" : "this file"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => selectedFile && deleteMutation.mutate(selectedFile.path)}
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New name"
            data-testid="input-rename"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialogOpen(false)} data-testid="button-rename-cancel">
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName || renameMutation.isPending} data-testid="button-rename-confirm">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            data-testid="input-new-folder-name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderDialogOpen(false)} data-testid="button-new-folder-cancel">
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName || createFolderMutation.isPending} data-testid="button-new-folder-confirm">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
