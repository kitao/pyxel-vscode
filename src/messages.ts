// Message protocol between the extension host and Pyxel webviews.

export type HostToWebviewMessage =
  | { command: "run"; scriptName: string; files: Record<string, string> }
  | { command: "edit"; fileName: string; fileData: string | null; palData: string | null }
  | { command: "play"; fileName: string; fileData: string }
  | { command: "key"; code: string; key: string; shift: boolean };

export type WebviewToHostMessage =
  | { command: "ready" }
  | { command: "title"; title: string }
  | { command: "error"; message: string }
  | { command: "saved"; fileName: string; data: string };

// Webviews run workspace-provided code, so every incoming message is untrusted.
export function parseWebviewMessage(msg: unknown): WebviewToHostMessage | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as Record<string, unknown>;
  switch (m.command) {
    case "ready":
      return { command: "ready" };
    case "title":
      return typeof m.title === "string"
        ? { command: "title", title: m.title } : undefined;
    case "error":
      return typeof m.message === "string"
        ? { command: "error", message: m.message } : undefined;
    case "saved":
      return typeof m.fileName === "string" && typeof m.data === "string"
        ? { command: "saved", fileName: m.fileName, data: m.data } : undefined;
    default:
      return undefined;
  }
}
