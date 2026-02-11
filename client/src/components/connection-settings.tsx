import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Settings, Server, Key, Upload, Check, AlertCircle, Wifi, WifiOff, Loader2 } from "lucide-react";
import { connectionConfigSchema, type InsertConnectionConfig, type ConnectionConfig } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ConnectionSettingsProps {
  connection: ConnectionConfig | null;
  onSave: (config: InsertConnectionConfig, pemFile: File | null) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  panelId: "left" | "right";
  triggerClassName?: string;
  label?: string;
}

export function ConnectionSettings({ connection, onSave, onConnected, onDisconnected, panelId, triggerClassName, label }: ConnectionSettingsProps) {
  const [open, setOpen] = useState(false);
  const [pemFile, setPemFile] = useState<File | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InsertConnectionConfig>({
    resolver: zodResolver(connectionConfigSchema),
    defaultValues: {
      host: connection?.host || "",
      username: connection?.username || "",
      port: connection?.port || 22,
    },
  });

  const handleSubmit = async (values: InsertConnectionConfig) => {
    setConnecting(true);
    setError(null);

    try {
      // Step 1: Upload PEM key if provided
      const pemToUpload = pemFile;
      if (pemToUpload) {
        const formData = new FormData();
        formData.append("pemFile", pemToUpload);
        formData.append("connectionId", panelId);
        const uploadRes = await fetch("/api/ssh/upload-key", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error || "Failed to upload PEM key");
        }
      }

      // Step 2: Establish SSH connection
      const connectRes = await apiRequest("POST", "/api/ssh/connect", {
        connectionId: panelId,
        host: values.host,
        port: values.port,
        username: values.username,
      });
      if (!connectRes.ok) {
        const data = await connectRes.json();
        throw new Error(data.error || "Failed to connect");
      }

      // Step 3: Update parent state
      onSave(values, pemToUpload);
      onConnected?.();
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await apiRequest("POST", "/api/ssh/disconnect", { connectionId: panelId });
    } catch {}
    onDisconnected?.();
    setOpen(false);
  };

  const handlePemSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPemFile(file);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-2 ${triggerClassName || ""}`} data-testid="button-connection-settings">
          <Server className="h-4 w-4" />
          <span className="hidden sm:inline">
            {label || connection?.host || "SSH Config"}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            EC2 Connection Settings
          </DialogTitle>
          <DialogDescription>
            Configure your EC2 instance connection. Upload your .pem file for SSH authentication.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host / IP Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ec2-xx-xx-xx-xx.compute.amazonaws.com"
                      {...field}
                      disabled={connecting}
                      data-testid="input-host"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ubuntu"
                      {...field}
                      disabled={connecting}
                      data-testid="input-username"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 22)}
                      disabled={connecting}
                      data-testid="input-port"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">SSH Key (.pem file)</label>
              <div
                className={`flex items-center gap-3 p-3 border border-dashed rounded-md cursor-pointer transition-colors ${
                  pemFile
                    ? "border-green-500/50 bg-green-500/10"
                    : "border-muted-foreground/30 hover:border-muted-foreground/50"
                }`}
                onClick={() => !connecting && fileInputRef.current?.click()}
              >
                {pemFile ? (
                  <>
                    <Check className="h-5 w-5 text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{pemFile.name}</p>
                      <p className="text-xs text-muted-foreground">Click to change</p>
                    </div>
                  </>
                ) : connection?.pemFileName ? (
                  <>
                    <Key className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{connection.pemFileName}</p>
                      <p className="text-xs text-muted-foreground">Key uploaded. Click to replace</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Upload .pem file</p>
                      <p className="text-xs text-muted-foreground">
                        Required for SSH authentication
                      </p>
                    </div>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pem"
                className="hidden"
                onChange={handlePemSelect}
                data-testid="input-pem-file"
              />
            </div>

            {connection && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
                {connection.connected ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-500 flex-1">Connected to {connection.host}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground flex-1">
                      Not connected
                    </span>
                  </>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              {connection?.connected && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={connecting}
                >
                  Disconnect
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={connecting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={connecting || (!pemFile && !connection?.pemFileName)}
                data-testid="button-save-connection"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : connection?.connected ? (
                  "Reconnect"
                ) : (
                  "Connect"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
