import * as vscode from "vscode";
import { type HostToWebviewMessage, parseWebviewMessage } from "./messages";
import { isSafeFileName } from "./utils";
import { getWebviewHtml } from "./webviewHtml";

interface ForwardKeyArgs {
  code: string;
  key: string;
  shift?: boolean;
}

export class PyxelWebviewManager {
  private activeWebview: vscode.Webview | undefined;
  private errorPanelShown = false;

  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  initialize(
    panel: vscode.WebviewPanel,
    onReady: () => void,
    onSaved?: (fileName: string, data: string) => void
  ): void {
    panel.webview.options = { enableScripts: true, localResourceRoots: [] };
    panel.webview.html = getWebviewHtml();
    this.track(panel);

    panel.webview.onDidReceiveMessage((raw: unknown) => {
      const message = parseWebviewMessage(raw);
      if (!message) {
        this.outputChannel.appendLine(
          "Ignored malformed message from webview."
        );
        return;
      }
      switch (message.command) {
        case "ready":
          onReady();
          break;
        case "title":
          panel.title = message.title;
          break;
        case "error":
          this.reportError(message.message);
          break;
        case "saved":
          if (!onSaved) break;
          if (!isSafeFileName(message.fileName)) {
            this.outputChannel.appendLine(
              `Ignored save request with unsafe file name: ${message.fileName}`
            );
            break;
          }
          onSaved(message.fileName, message.data);
          break;
      }
    });
  }

  post(webview: vscode.Webview, message: HostToWebviewMessage): void {
    webview.postMessage(message);
  }

  forwardKey(args: unknown): void {
    if (!isForwardKeyArgs(args) || !this.activeWebview) return;
    this.post(this.activeWebview, {
      command: "key",
      code: args.code,
      key: args.key,
      shift: !!args.shift,
    });
  }

  resetErrorState(): void {
    this.errorPanelShown = false;
  }

  private reportError(message: string): void {
    this.outputChannel.appendLine(message);
    if (this.errorPanelShown) return;
    this.errorPanelShown = true;
    this.outputChannel.show(true);
  }

  private track(panel: vscode.WebviewPanel): void {
    if (panel.active) this.activeWebview = panel.webview;
    panel.onDidChangeViewState(() => {
      if (panel.active) this.activeWebview = panel.webview;
    });
    panel.onDidDispose(() => {
      if (this.activeWebview === panel.webview) {
        this.activeWebview = undefined;
      }
    });
  }
}

function isForwardKeyArgs(args: unknown): args is ForwardKeyArgs {
  if (!args || typeof args !== "object") return false;
  const value = args as { code?: unknown; key?: unknown };
  return typeof value.code === "string" && typeof value.key === "string";
}
