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
import { Settings, Server, Key, Upload, Check, AlertCircle, Wifi, WifiOff } from "lucide-react";
import { connectionConfigSchema, type InsertConnectionConfig, type ConnectionConfig } from "@shared/schema";

interface ConnectionSettingsProps {
  connection: ConnectionConfig | null;
  onSave: (config: InsertConnectionConfig, pemFile: File | null) => void;
}

export function ConnectionSettings({ connection, onSave }: ConnectionSettingsProps) {
  const [open, setOpen] = useState(false);
  const [pemFile, setPemFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InsertConnectionConfig>({
    resolver: zodResolver(connectionConfigSchema),
    defaultValues: {
      host: connection?.host || "",
      username: connection?.username || "",
      port: connection?.port || 22,
    },
  });

  const handleSubmit = (values: InsertConnectionConfig) => {
    onSave(values, pemFile);
    setOpen(false);
  };

  const handlePemSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPemFile(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" data-testid="button-connection-settings">
          {connection?.connected ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="hidden sm:inline">
            {connection?.host || "Not Connected"}
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
                onClick={() => fileInputRef.current?.click()}
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
                      <p className="text-xs text-muted-foreground">Click to replace</p>
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
                    <span className="text-sm text-green-500">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Not connected - using local filesystem
                    </span>
                  </>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" data-testid="button-save-connection">
                Save Settings
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
