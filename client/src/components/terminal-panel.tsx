import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Terminal as TerminalIcon, Maximize2, Minimize2 } from "lucide-react";

interface TerminalSession {
  id: string;
  name: string;
}

interface TerminalPanelProps {
  openVimPath: string | null;
  onVimOpened: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

export function TerminalPanel({
  openVimPath,
  onVimOpened,
  isMaximized,
  onToggleMaximize,
}: TerminalPanelProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([{ id: "1", name: "bash" }]);
  const [activeSession, setActiveSession] = useState("1");
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<any>(null);
  const sessionIdRef = useRef<string>("1");

  const connectWebSocket = useCallback((sessionId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?session=${sessionId}`);

    ws.onopen = () => {
      if (xtermRef.current) {
        const dims = fitAddonRef.current?.proposeDimensions?.();
        if (dims) {
          ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    ws.onmessage = (event) => {
      if (xtermRef.current && event.data) {
        xtermRef.current.write(event.data);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      if (xtermRef.current) {
        xtermRef.current.write("\r\n\x1b[31mConnection closed\x1b[0m\r\n");
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    let mounted = true;

    const initTerminal = async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      await import("@xterm/xterm/css/xterm.css");

      if (!mounted || !terminalRef.current) return;

      const fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        theme: {
          background: "#0d1117",
          foreground: "#c9d1d9",
          cursor: "#58a6ff",
          cursorAccent: "#0d1117",
          selectionBackground: "#264f78",
          black: "#484f58",
          red: "#ff7b72",
          green: "#3fb950",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#39c5cf",
          white: "#b1bac4",
          brightBlack: "#6e7681",
          brightRed: "#ffa198",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#f0f6fc",
        },
        scrollback: 5000,
        convertEol: true,
      });

      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = term;

      term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
        }
      });

      term.onResize(({ cols, rows }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });

      connectWebSocket(sessionIdRef.current);
    };

    initTerminal();

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
      }
    };
  }, [connectWebSocket]);

  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current) {
        setTimeout(() => {
          fitAddonRef.current?.fit?.();
        }, 100);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit?.();
      }, 100);
    }
  }, [isMaximized]);

  useEffect(() => {
    if (openVimPath && wsRef.current?.readyState === WebSocket.OPEN) {
      const command = `vim "${openVimPath}"\n`;
      wsRef.current.send(command);
      onVimOpened();
    }
  }, [openVimPath, onVimOpened]);

  const handleNewSession = () => {
    const newId = (parseInt(sessions[sessions.length - 1]?.id || "0") + 1).toString();
    setSessions([...sessions, { id: newId, name: "bash" }]);
    setActiveSession(newId);
    sessionIdRef.current = newId;
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    connectWebSocket(newId);
  };

  const handleCloseSession = (id: string) => {
    if (sessions.length <= 1) return;
    const newSessions = sessions.filter((s) => s.id !== id);
    setSessions(newSessions);
    if (activeSession === id) {
      const newActive = newSessions[0].id;
      setActiveSession(newActive);
      sessionIdRef.current = newActive;
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
      connectWebSocket(newActive);
    }
  };

  const handleSwitchSession = (id: string) => {
    if (id === activeSession) return;
    setActiveSession(id);
    sessionIdRef.current = id;
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    connectWebSocket(id);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center gap-2 px-3 py-2 bg-card border-b border-border">
        <TerminalIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Terminal</span>
        <div className="flex-1 flex items-center gap-1 ml-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors text-xs ${
                activeSession === session.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover-elevate"
              }`}
              onClick={() => handleSwitchSession(session.id)}
            >
              <span>{session.name}</span>
              {sessions.length > 1 && (
                <X
                  className="h-3 w-3 opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseSession(session.id);
                  }}
                />
              )}
            </div>
          ))}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={handleNewSession}
            data-testid="button-new-terminal"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleMaximize}
          data-testid="button-maximize-terminal"
        >
          {isMaximized ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div ref={terminalRef} className="flex-1 p-2" data-testid="terminal-container" />
    </div>
  );
}
