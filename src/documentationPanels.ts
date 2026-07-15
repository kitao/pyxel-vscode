import * as vscode from "vscode";

export function createDocumentationCommand(
  viewType: string,
  title: string,
  url: string
): () => void {
  let panel: vscode.WebviewPanel | undefined;
  return () => {
    if (panel) {
      panel.reveal();
      return;
    }
    panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [] }
    );
    panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      frame-src https://kitao.github.io;
      style-src 'unsafe-inline';">
  <style>
    html, body, iframe {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      border: none;
      overflow: hidden;
      display: block;
    }
  </style>
</head>
<body>
  <iframe src="${url}" title="${title}"></iframe>
</body>
</html>`;
    panel.onDidDispose(() => {
      panel = undefined;
    });
  };
}
