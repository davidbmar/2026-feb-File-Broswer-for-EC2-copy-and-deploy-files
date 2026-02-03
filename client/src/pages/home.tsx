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
  Maximize2, Minimize2, Monitor, Server 
} from "lucide-react";
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

  const handleOpenInTerminal = useCallback((path: string) => {
    setOpenVimPath(path);
  }, []);

  const handleVimOpened = useCallback(() => {
    setOpenVimPath(null);
  }, []);

  const handleDownload = useCallback((path: string) => {
    window.open(`/api/download?path=${encodeURIComponent(path)}`, "_blank");
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

  const handleSetLeftLocal = useCallback(() => {
    setLeftPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: null,
    }));
  }, []);

  const handleSetRightLocal = useCallback(() => {
    setRightPanel((prev) => ({
      ...prev,
      isLocal: true,
      connection: null,
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

  const copyMutation = useMutation({
    mutationFn: async ({ sources, destination }: { sources: string[]; destination: string }) => {
      return apiRequest("POST", "/api/files/copy", { sources, destination });
    },
    onSuccess: (_, { destination }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/files", destination] });
      toast({
        title: "Files copied",
        description: "Files have been copied successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Copy failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleFileDrop = useCallback(
    (targetPanel: "left" | "right", files: FileEntry[]) => {
      const targetPath = targetPanel === "left" ? leftPanel.currentPath : rightPanel.currentPath;
      const sources = files.map((f) => f.path);
      copyMutation.mutate({ sources, destination: targetPath });
    },
    [leftPanel.currentPath, rightPanel.currentPath, copyMutation]
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
    onSetLocal,
    onToggleMinimize,
    side,
  }: {
    panel: PanelConfig;
    onConnectionSave: (config: InsertConnectionConfig, pemFile: File | null) => void;
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
                        onSetLocal={handleSetLeftLocal}
                        onToggleMinimize={toggleLeftMinimize}
                        side="left"
                      />
                      <div className="flex-1 overflow-hidden">
                        <FileBrowser
                          panelId="left"
                          onOpenInTerminal={handleOpenInTerminal}
                          onDownload={handleDownload}
                          currentPath={leftPanel.currentPath}
                          setCurrentPath={handleLeftPathChange}
                          selectedFiles={leftPanel.selectedFiles}
                          onSelectionChange={handleLeftSelectionChange}
                          onFileDrop={(files) => handleFileDrop("left", files)}
                          isLocal={leftPanel.isLocal}
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
                        onSetLocal={handleSetRightLocal}
                        onToggleMinimize={toggleRightMinimize}
                        side="right"
                      />
                      <div className="flex-1 overflow-hidden">
                        <FileBrowser
                          panelId="right"
                          onOpenInTerminal={handleOpenInTerminal}
                          onDownload={handleDownload}
                          currentPath={rightPanel.currentPath}
                          setCurrentPath={handleRightPathChange}
                          selectedFiles={rightPanel.selectedFiles}
                          onSelectionChange={handleRightSelectionChange}
                          onFileDrop={(files) => handleFileDrop("right", files)}
                          isLocal={rightPanel.isLocal}
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
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>
    </div>
  );
}
