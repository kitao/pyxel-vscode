export type HostToWebviewMessage =
  | { command: "run"; sessionId: number; scriptName: string; files: Record<string, string> }
  | {
    command: "edit";
    fileName: string;
    fileData: string | null;
    palData: string | null;
  }
  | { command: "play"; fileName: string; fileData: string }
  | { command: "key"; code: string; key: string; shift: boolean };

export type WebviewToHostMessage =
  | { command: "ready" }
  | { command: "title"; title: string }
  | { command: "error"; message: string }
  | { command: "log"; message: string }
  | { command: "saved"; fileName: string; data: string; sessionId?: number };

// Webviews run workspace-provided code, so every incoming message is untrusted.
export function parseWebviewMessage(
  msg: unknown
): WebviewToHostMessage | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const m = msg as Record<string, unknown>;
  switch (m.command) {
    case "ready":
      return { command: "ready" };
    case "title": {
      if (typeof m.title !== "string") return undefined;
      return { command: "title", title: m.title };
    }
    case "error":
    case "log": {
      if (typeof m.message !== "string") return undefined;
      return { command: m.command, message: m.message };
    }
    case "saved": {
      if (
        typeof m.fileName !== "string" ||
        typeof m.data !== "string" ||
        !isCanonicalBase64(m.data) ||
        (m.sessionId !== undefined && !isSessionId(m.sessionId))
      ) {
        return undefined;
      }
      return {
        command: "saved", fileName: m.fileName, data: m.data,
        ...(m.sessionId === undefined ? {} : { sessionId: m.sessionId }),
      };
    }
    default:
      return undefined;
  }
}

function isSessionId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalBase64(data: string): boolean {
  return Buffer.from(data, "base64").toString("base64") === data;
}
