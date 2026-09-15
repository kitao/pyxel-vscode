import * as fs from "fs";
import * as path from "path";
import { PYXEL_CDN_BASE, getNonce } from "./utils";

// src/webview is compiled on its own; the result is inlined into the page so
// the Webview needs no local resource roots.
export function readWebviewScript(extensionPath: string): string {
  return fs.readFileSync(
    path.join(extensionPath, "dist", "webview", "main.js"),
    "utf8"
  );
}

export function getWebviewHtml(script: string): string {
  const nonce = getNonce();
  // The script is inlined, so a literal </script in it would end the tag.
  const inlineScript = script.replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src https://cdn.jsdelivr.net;
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net 'unsafe-eval';
      style-src https://cdn.jsdelivr.net 'unsafe-inline';
      img-src https://cdn.jsdelivr.net data: blob:;
      connect-src https://cdn.jsdelivr.net blob: data:;
      worker-src blob:;
      font-src https://cdn.jsdelivr.net data:;
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
      color: #ddd;
      font-family: sans-serif;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div id="pyxel-error" role="alert"></div>
  <script src="${PYXEL_CDN_BASE}/pyxel.js"></script>
  <script type="module" nonce="${nonce}">
${inlineScript}
  </script>
</body>
</html>`;
}
