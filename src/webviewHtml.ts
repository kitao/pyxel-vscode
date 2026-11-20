import { getNonce } from "./utils";

export function getWebviewHtml(assetBase: string, cspSource: string): string {
  const nonce = getNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      script-src 'nonce-${nonce}' ${cspSource} 'unsafe-eval';
      style-src ${cspSource} 'unsafe-inline';
      img-src ${cspSource} https://kitao.dev https://cdn.jsdelivr.net data: blob:;
      connect-src ${cspSource} https://kitao.dev https://cdn.jsdelivr.net blob: data:;
      worker-src blob:;
      font-src ${cspSource} https://kitao.dev https://cdn.jsdelivr.net data:;
      child-src blob:;">
  <style>
    body {
      margin: 0;
      overflow: hidden;
      background: #000;
    }
    #pyxel-prompt {
      display: none !important;
    }
    #pyxel-error {
      display: none;
      padding: 16px;
      position: absolute;
      inset: 0 0 auto;
      z-index: 10000;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      font: var(--vscode-font-size) var(--vscode-font-family);
    }
    #pyxel-error button {
      margin-left: 12px;
      padding: 4px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-contrastBorder, transparent);
      cursor: pointer;
    }
    #pyxel-error button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
    }
  </style>
</head>
<body>
  <div id="pyxel-error" role="alert"></div>
  <script nonce="${nonce}" src="${assetBase}/runtime/pyxel.js"></script>
  <script type="module" nonce="${nonce}" src="${assetBase}/main.js"></script>
</body>
</html>`;
}
