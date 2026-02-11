import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FileBrowser } from "@/components/file-browser";
import { TerminalPanel } from "@/components/terminal-panel";
import { ConnectionSettings } from "@/components/connection-settings";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import {
  Sun, Moon, Terminal, ChevronLeft, ChevronRight,
  Maximize2, Minimize2, Monitor, Server, HelpCircle, ExternalLink
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ConnectionConfig, InsertConnectionConfig, FileEntry, PanelConfig } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [openVimPath, setOpenVimPath] = useState<string | null>(null);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);

  const [leftPanel, setLeftPanel] = useState<PanelConfig>({
    id: "left",
    isLocal: true,
    connection: null,
    currentPath: "/",
    isMinimized: false,
    selectedFiles: [],
  });

  const [rightPanel, setRightPanel] = useState<PanelConfig>({
    id: "right",
    isLocal: false,
    connection: {
      id: "right",
      host: "",
      username: "",
      port: 22,
      connected: false,
    },
    currentPath: "/",
    isMinimized: false,
    selectedFiles: [],
  });

  // Derive connectionId for each panel
  const leftConnectionId = leftPanel.isLocal ? null : (leftPanel.connection?.connected ? leftPanel.connection.id : null);
  const rightConnectionId = rightPanel.isLocal ? null : (rightPanel.connection?.connected ? rightPanel.connection.id : null);

  // Use the right panel's connectionId for terminal (since right panel defaults to remote)
  const terminalConnectionId = rightConnectionId || leftConnectionId;

  const handleOpenInTerminal = useCallback((path: string) => {
    setOpenVimPath(path);
  }, []);

  const handleVimOpened = useCallback(() => {
    setOpenVimPath(null);
  }, []);

  const handleDownload = useCallback((path: string, connectionId?: string | null) => {
    const params = new URLSearchParams({ path });
    if (connectionId) params.set("connectionId", connectionId);
    window.open(`/api/download?${params}`, "_blank");
  }, []);

  const handleLeftConnectionSave = useCallback(
    (config: InsertConnectionConfig, pemFile: File | null) => {
      setLeftPanel((prev) => ({
        ...prev,
        isLocal: false,
        connection: {
          id: "left",
          ...config,
          pemFileName: pemFile?.name || prev.connection?.pemFileName,
          connected: false,
        },
      }));
    },
    []
  );

  const handleRightConnectionSave = useCallback(
    (config: InsertConnectionConfig, pemFile: File | null) => {
      setRightPanel((prev) => ({
        ...prev,
        isLocal: false,
        connection: {
          id: "right",
          ...config,
          pemFileName: pemFile?.name || prev.connection?.pemFileName,
          connected: false,
        },
      }));
    },
    []
  );

  const handleLeftConnected = useCallback(() => {
    setLeftPanel((prev) => ({
      ...prev,
      connection: prev.connection ? { ...prev.connection, connected: true } : null,
      currentPath: "/",
    }));
  }, []);

  const handleRightConnected = useCallback(() => {
    setRightPanel((prev) => ({
      ...prev,
      connection: prev.connection ? { ...prev.connection, connected: true } : null,
      currentPath: "/",
    }));
  }, []);

  const handleLeftDisconnected = useCallback(() => {
    setLeftPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: prev.connection ? { ...prev.connection, connected: false } : null,
      currentPath: "/",
    }));
  }, []);

  const handleRightDisconnected = useCallback(() => {
    setRightPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: prev.connection ? { ...prev.connection, connected: false } : null,
      currentPath: "/",
    }));
  }, []);

  const handleSetLeftLocal = useCallback(() => {
    setLeftPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: null,
      currentPath: "/",
    }));
  }, []);

  const handleSetRightLocal = useCallback(() => {
    setRightPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: null,
      currentPath: "/",
    }));
  }, []);

  const handleLeftPathChange = useCallback((path: string) => {
    setLeftPanel((prev) => ({ ...prev, currentPath: path }));
  }, []);

  const handleRightPathChange = useCallback((path: string) => {
    setRightPanel((prev) => ({ ...prev, currentPath: path }));
  }, []);

  const handleLeftSelectionChange = useCallback((files: FileEntry[]) => {
    setLeftPanel((prev) => ({ ...prev, selectedFiles: files }));
  }, []);

  const handleRightSelectionChange = useCallback((files: FileEntry[]) => {
    setRightPanel((prev) => ({ ...prev, selectedFiles: files }));
  }, []);

  // Same-host copy mutation
  const copyMutation = useMutation({
    mutationFn: async ({ sources, destination, connectionId }: { sources: string[]; destination: string; connectionId?: string | null }) => {
      return apiRequest("POST", "/api/files/copy", { sources, destination, connectionId: connectionId || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "Files copied", description: "Files have been copied successfully" });
    },
    onError: (error) => {
      toast({ title: "Copy failed", description: (error as Error).message, variant: "destructive" });
    },
  });

  // Same-host move mutation
  const moveMutation = useMutation({
    mutationFn: async ({ sources, destination, connectionId }: { sources: string[]; destination: string; connectionId?: string | null }) => {
      return apiRequest("POST", "/api/files/move", { sources, destination, connectionId: connectionId || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "Files moved", description: "Files have been moved successfully" });
    },
    onError: (error) => {
      toast({ title: "Move failed", description: (error as Error).message, variant: "destructive" });
    },
  });

  // Cross-host transfer mutation
  const transferMutation = useMutation({
    mutationFn: async ({ sources, destination, sourceConnectionId, destConnectionId, operation }: {
      sources: string[];
      destination: string;
      sourceConnectionId: string | null;
      destConnectionId: string | null;
      operation: "copy" | "move";
    }) => {
      return apiRequest("POST", "/api/files/transfer", {
        sources,
        destination,
        sourceConnectionId: sourceConnectionId || undefined,
        destConnectionId: destConnectionId || undefined,
        operation,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "Transfer complete", description: "Files have been transferred successfully" });
    },
    onError: (error) => {
      toast({ title: "Transfer failed", description: (error as Error).message, variant: "destructive" });
    },
  });

  const handleFileDrop = useCallback(
    (targetPanel: "left" | "right", files: FileEntry[], isCopy: boolean) => {
      const sourcePanel = targetPanel === "left" ? rightPanel : leftPanel;
      const destPanel = targetPanel === "left" ? leftPanel : rightPanel;
      const sourceConnId = sourcePanel.isLocal ? null : (sourcePanel.connection?.connected ? sourcePanel.connection.id : null);
      const destConnId = destPanel.isLocal ? null : (destPanel.connection?.connected ? destPanel.connection.id : null);
      const targetPath = destPanel.currentPath;
      const sources = files.map((f) => f.path);

      if (sourceConnId !== destConnId) {
        // Cross-host transfer
        transferMutation.mutate({
          sources,
          destination: targetPath,
          sourceConnectionId: sourceConnId,
          destConnectionId: destConnId,
          operation: isCopy ? "copy" : "move",
        });
      } else {
        // Same-host operation
        if (isCopy) {
          copyMutation.mutate({ sources, destination: targetPath, connectionId: destConnId });
        } else {
          moveMutation.mutate({ sources, destination: targetPath, connectionId: destConnId });
        }
      }
    },
    [leftPanel, rightPanel, copyMutation, moveMutation, transferMutation]
  );

  const toggleLeftMinimize = useCallback(() => {
    setLeftPanel((prev) => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  const toggleRightMinimize = useCallback(() => {
    setRightPanel((prev) => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  const PanelHeader = ({
    panel,
    onConnectionSave,
    onConnected,
    onDisconnected,
    onSetLocal,
    onToggleMinimize,
    side,
  }: {
    panel: PanelConfig;
    onConnectionSave: (config: InsertConnectionConfig, pemFile: File | null) => void;
    onConnected: () => void;
    onDisconnected: () => void;
    onSetLocal: () => void;
    onToggleMinimize: () => void;
    side: "left" | "right";
  }) => (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onToggleMinimize}
        data-testid={`button-${side}-minimize`}
      >
        {panel.isMinimized ? (
          side === "left" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
        ) : (
          side === "left" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        )}
      </Button>

      {!panel.isMinimized && (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {panel.isLocal ? (
              <Badge variant="outline" className="gap-1">
                <Monitor className="h-3 w-3" />
                Local
              </Badge>
            ) : panel.connection?.connected ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <Server className="h-3 w-3" />
                {panel.connection.host}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Server className="h-3 w-3" />
                {panel.connection?.host || "Not configured"}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!panel.isLocal && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onSetLocal}
                className="h-7 text-xs"
                data-testid={`button-${side}-set-local`}
              >
                <Monitor className="h-3 w-3 mr-1" />
                Local
              </Button>
            )}
            <ConnectionSettings
              connection={panel.connection}
              onSave={onConnectionSave}
              onConnected={onConnected}
              onDisconnected={onDisconnected}
              panelId={side}
              triggerClassName="h-7"
              label={panel.isLocal ? "SSH" : "Edit"}
            />
          </div>
        </>
      )}
    </div>
  );

  const MinimizedPanel = ({
    panel,
    onToggleMinimize,
    side,
  }: {
    panel: PanelConfig;
    onToggleMinimize: () => void;
    side: "left" | "right";
  }) => (
    <div className="flex flex-col h-full bg-muted/30 border-r border-border">
      <Button
        size="icon"
        variant="ghost"
        className="m-2"
        onClick={onToggleMinimize}
        data-testid={`button-${side}-expand`}
      >
        {side === "left" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
      <div className="flex-1 flex items-center justify-center">
        <div className="writing-mode-vertical text-xs text-muted-foreground transform rotate-180" style={{ writingMode: "vertical-rl" }}>
          {panel.isLocal ? "Local Files" : panel.connection?.host || "Remote Files"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Remote Dev UI</h1>
        </div>

        <div className="flex-1" />

        <Dialog>
          <DialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-help"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Deployment Instructions
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-6 text-sm">
                <section>
                  <h3 className="font-semibold text-base mb-2">Overview</h3>
                  <p className="text-muted-foreground">
                    This Remote Dev UI can be deployed on your laptop or an EC2 instance to manage local and remote filesystems through a web interface.
                  </p>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Prerequisites</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Node.js 18+ installed</li>
                    <li>npm or yarn package manager</li>
                    <li>Git (to clone the repository)</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Deploy on Your Laptop</h3>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-2">
                    <p className="text-muted-foreground"># 1. Clone or download the project</p>
                    <p>git clone &lt;repository-url&gt;</p>
                    <p>cd remote-dev-ui</p>
                    <p className="text-muted-foreground mt-2"># 2. Install dependencies</p>
                    <p>npm install</p>
                    <p className="text-muted-foreground mt-2"># 3. Start the application</p>
                    <p>npm run dev</p>
                    <p className="text-muted-foreground mt-2"># 4. Open in browser</p>
                    <p>http://localhost:5000</p>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Deploy on EC2</h3>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-2">
                    <p className="text-muted-foreground"># 1. SSH into your EC2 instance</p>
                    <p>ssh -i your-key.pem ec2-user@your-ec2-ip</p>
                    <p className="text-muted-foreground mt-2"># 2. Install Node.js (if not installed)</p>
                    <p>curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -</p>
                    <p>sudo apt-get install -y nodejs</p>
                    <p className="text-muted-foreground mt-2"># 3. Clone and setup the project</p>
                    <p>git clone &lt;repository-url&gt;</p>
                    <p>cd remote-dev-ui</p>
                    <p>npm install</p>
                    <p className="text-muted-foreground mt-2"># 4. Start with PM2 (recommended for production)</p>
                    <p>npm install -g pm2</p>
                    <p>pm2 start npm --name "dev-ui" -- run dev</p>
                    <p className="text-muted-foreground mt-2"># 5. Configure security group</p>
                    <p className="text-muted-foreground"># Allow inbound traffic on port 5000</p>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Production Build</h3>
                  <div className="bg-muted p-3 rounded-md font-mono text-xs space-y-2">
                    <p className="text-muted-foreground"># Build for production</p>
                    <p>npm run build</p>
                    <p className="text-muted-foreground mt-2"># Start production server</p>
                    <p>NODE_ENV=production node dist/index.js</p>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Environment Variables</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><code className="bg-muted px-1 rounded">PORT</code> - Server port (default: 5000)</li>
                    <li><code className="bg-muted px-1 rounded">SESSION_SECRET</code> - Session encryption key</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-base mb-2">Features</h3>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Dual-pane file browser with drag-and-drop</li>
                    <li>Move files (drag) or Copy (Ctrl/Cmd + drag)</li>
                    <li>Interactive terminal with multiple sessions</li>
                    <li>File preview with syntax highlighting</li>
                    <li>SSH connection settings for remote access</li>
                  </ul>
                </section>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </header>

      <main className="flex-1 overflow-hidden">
        {isTerminalMaximized ? (
          <TerminalPanel
            openVimPath={openVimPath}
            onVimOpened={handleVimOpened}
            isMaximized={isTerminalMaximized}
            onToggleMaximize={() => setIsTerminalMaximized(false)}
            connectionId={terminalConnectionId}
          />
        ) : (
          <ResizablePanelGroup direction="vertical" className="h-full">
            <ResizablePanel defaultSize={65} minSize={30}>
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel
                  defaultSize={leftPanel.isMinimized ? 3 : 50}
                  minSize={leftPanel.isMinimized ? 3 : 3}
                  maxSize={leftPanel.isMinimized ? 3 : 97}
                >
                  {leftPanel.isMinimized ? (
                    <MinimizedPanel
                      panel={leftPanel}
                      onToggleMinimize={toggleLeftMinimize}
                      side="left"
                    />
                  ) : (
                    <div className="h-full flex flex-col border-r border-border">
                      <PanelHeader
                        panel={leftPanel}
                        onConnectionSave={handleLeftConnectionSave}
                        onConnected={handleLeftConnected}
                        onDisconnected={handleLeftDisconnected}
                        onSetLocal={handleSetLeftLocal}
                        onToggleMinimize={toggleLeftMinimize}
                        side="left"
                      />
                      <div className="flex-1 overflow-hidden">
                        <FileBrowser
                          panelId="left"
                          onOpenInTerminal={handleOpenInTerminal}
                          onDownload={(path) => handleDownload(path, leftConnectionId)}
                          currentPath={leftPanel.currentPath}
                          setCurrentPath={handleLeftPathChange}
                          selectedFiles={leftPanel.selectedFiles}
                          onSelectionChange={handleLeftSelectionChange}
                          onFileDrop={(files, isCopy) => handleFileDrop("left", files, isCopy)}
                          isLocal={leftPanel.isLocal}
                          connectionId={leftConnectionId}
                        />
                      </div>
                    </div>
                  )}
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  defaultSize={rightPanel.isMinimized ? 3 : 50}
                  minSize={rightPanel.isMinimized ? 3 : 3}
                  maxSize={rightPanel.isMinimized ? 3 : 97}
                >
                  {rightPanel.isMinimized ? (
                    <MinimizedPanel
                      panel={rightPanel}
                      onToggleMinimize={toggleRightMinimize}
                      side="right"
                    />
                  ) : (
                    <div className="h-full flex flex-col">
                      <PanelHeader
                        panel={rightPanel}
                        onConnectionSave={handleRightConnectionSave}
                        onConnected={handleRightConnected}
                        onDisconnected={handleRightDisconnected}
                        onSetLocal={handleSetRightLocal}
                        onToggleMinimize={toggleRightMinimize}
                        side="right"
                      />
                      <div className="flex-1 overflow-hidden">
                        <FileBrowser
                          panelId="right"
                          onOpenInTerminal={handleOpenInTerminal}
                          onDownload={(path) => handleDownload(path, rightConnectionId)}
                          currentPath={rightPanel.currentPath}
                          setCurrentPath={handleRightPathChange}
                          selectedFiles={rightPanel.selectedFiles}
                          onSelectionChange={handleRightSelectionChange}
                          onFileDrop={(files, isCopy) => handleFileDrop("right", files, isCopy)}
                          isLocal={rightPanel.isLocal}
                          connectionId={rightConnectionId}
                        />
                      </div>
                    </div>
                  )}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={35} minSize={15}>
              <TerminalPanel
                openVimPath={openVimPath}
                onVimOpened={handleVimOpened}
                isMaximized={isTerminalMaximized}
                onToggleMaximize={() => setIsTerminalMaximized(true)}
                connectionId={terminalConnectionId}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>
    </div>
  );
}
