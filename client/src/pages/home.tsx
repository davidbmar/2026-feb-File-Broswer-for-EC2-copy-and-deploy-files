import { useState, useCallback } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FileBrowser } from "@/components/file-browser";
import { TerminalPanel } from "@/components/terminal-panel";
import { TransferPanel } from "@/components/transfer-panel";
import { ConnectionSettings } from "@/components/connection-settings";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Terminal, FolderTree, ArrowUpDown } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { ConnectionConfig, InsertConnectionConfig, TransferProgress } from "@shared/schema";

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [currentPath, setCurrentPath] = useState("/");
  const [openVimPath, setOpenVimPath] = useState<string | null>(null);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [uploadPath, setUploadPath] = useState("/");
  const [connection, setConnection] = useState<ConnectionConfig | null>({
    id: "local",
    host: "",
    username: "",
    port: 22,
    connected: false,
  });
  const [activePanel, setActivePanel] = useState<"files" | "terminal" | "transfers">("files");

  const handleOpenInTerminal = useCallback((path: string) => {
    setOpenVimPath(path);
    setActivePanel("terminal");
  }, []);

  const handleVimOpened = useCallback(() => {
    setOpenVimPath(null);
  }, []);

  const handleDownload = useCallback((path: string) => {
    window.open(`/api/download?path=${encodeURIComponent(path)}`, "_blank");
  }, []);

  const handleUpload = useCallback((path: string) => {
    setUploadPath(path);
    setActivePanel("transfers");
  }, []);

  const handleAddTransfer = useCallback((transfer: TransferProgress) => {
    setTransfers((prev) => [...prev, transfer]);
  }, []);

  const handleRemoveTransfer = useCallback((id: string) => {
    setTransfers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleUpdateTransfer = useCallback((id: string, update: Partial<TransferProgress>) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...update } : t))
    );
  }, []);

  const handleUploadComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/files", uploadPath] });
    queryClient.invalidateQueries({ queryKey: ["/api/files", currentPath] });
  }, [uploadPath, currentPath]);

  const handleSaveConnection = useCallback(
    (config: InsertConnectionConfig, pemFile: File | null) => {
      setConnection({
        id: "local",
        ...config,
        pemFileName: pemFile?.name || connection?.pemFileName,
        connected: false,
      });
    },
    [connection]
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Remote Dev UI</h1>
        </div>

        <div className="hidden md:flex items-center gap-1 ml-4">
          <Button
            variant={activePanel === "files" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("files")}
            className="gap-2"
            data-testid="button-panel-files"
          >
            <FolderTree className="h-4 w-4" />
            Files
          </Button>
          <Button
            variant={activePanel === "terminal" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("terminal")}
            className="gap-2"
            data-testid="button-panel-terminal"
          >
            <Terminal className="h-4 w-4" />
            Terminal
          </Button>
          <Button
            variant={activePanel === "transfers" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActivePanel("transfers")}
            className="gap-2"
            data-testid="button-panel-transfers"
          >
            <ArrowUpDown className="h-4 w-4" />
            Transfers
          </Button>
        </div>

        <div className="flex-1" />

        <ConnectionSettings connection={connection} onSave={handleSaveConnection} />

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
          <>
            <div className="hidden md:block h-full">
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                  <FileBrowser
                    onOpenInTerminal={handleOpenInTerminal}
                    onDownload={handleDownload}
                    onUpload={handleUpload}
                    currentPath={currentPath}
                    setCurrentPath={setCurrentPath}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={55} minSize={30}>
                  <TerminalPanel
                    openVimPath={openVimPath}
                    onVimOpened={handleVimOpened}
                    isMaximized={isTerminalMaximized}
                    onToggleMaximize={() => setIsTerminalMaximized(true)}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
                  <TransferPanel
                    transfers={transfers}
                    onAddTransfer={handleAddTransfer}
                    onRemoveTransfer={handleRemoveTransfer}
                    onUpdateTransfer={handleUpdateTransfer}
                    uploadPath={uploadPath}
                    onUploadComplete={handleUploadComplete}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="md:hidden h-full">
              {activePanel === "files" && (
                <FileBrowser
                  onOpenInTerminal={handleOpenInTerminal}
                  onDownload={handleDownload}
                  onUpload={handleUpload}
                  currentPath={currentPath}
                  setCurrentPath={setCurrentPath}
                />
              )}
              {activePanel === "terminal" && (
                <TerminalPanel
                  openVimPath={openVimPath}
                  onVimOpened={handleVimOpened}
                  isMaximized={isTerminalMaximized}
                  onToggleMaximize={() => setIsTerminalMaximized(true)}
                />
              )}
              {activePanel === "transfers" && (
                <TransferPanel
                  transfers={transfers}
                  onAddTransfer={handleAddTransfer}
                  onRemoveTransfer={handleRemoveTransfer}
                  onUpdateTransfer={handleUpdateTransfer}
                  uploadPath={uploadPath}
                  onUploadComplete={handleUploadComplete}
                />
              )}
            </div>
          </>
        )}
      </main>

      <footer className="md:hidden flex items-center border-t border-border bg-card">
        <Button
          variant="ghost"
          className={`flex-1 rounded-none py-3 gap-2 ${activePanel === "files" ? "bg-accent" : ""}`}
          onClick={() => setActivePanel("files")}
          data-testid="button-mobile-files"
        >
          <FolderTree className="h-4 w-4" />
          <span className="text-xs">Files</span>
        </Button>
        <Button
          variant="ghost"
          className={`flex-1 rounded-none py-3 gap-2 ${activePanel === "terminal" ? "bg-accent" : ""}`}
          onClick={() => setActivePanel("terminal")}
          data-testid="button-mobile-terminal"
        >
          <Terminal className="h-4 w-4" />
          <span className="text-xs">Terminal</span>
        </Button>
        <Button
          variant="ghost"
          className={`flex-1 rounded-none py-3 gap-2 ${activePanel === "transfers" ? "bg-accent" : ""}`}
          onClick={() => setActivePanel("transfers")}
          data-testid="button-mobile-transfers"
        >
          <ArrowUpDown className="h-4 w-4" />
          <span className="text-xs">Transfers</span>
        </Button>
      </footer>
    </div>
  );
}
