import { describe, expect, it } from "vitest";
import { getWebviewHtml } from "../webviewHtml";

const base = "https://file+.vscode-resource.vscode-cdn.net/extension/dist/webview";
const source = "https://*.vscode-cdn.net";

describe("getWebviewHtml", () => {
  it("loads both scripts from the installed extension", () => {
    const html = getWebviewHtml(base, source);
    expect([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]))
      .toEqual([`${base}/runtime/pyxel.js`, `${base}/main.js`]);
    expect(html).toContain('id="pyxel-error" role="alert"');
  });

  it("uses VS Code's resource policy and a fresh nonce for the scripts", () => {
    const html = getWebviewHtml(base, source);
    const nonce = html.match(/script-src 'nonce-(\w+)'/)?.[1];
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(html).toContain(`script-src 'nonce-${nonce}' ${source} 'unsafe-eval';`);
    for (const directive of ["img-src", "connect-src", "style-src"]) {
      expect(html).toContain(`${directive} ${source}`);
    }
    expect(html.match(new RegExp(`nonce="${nonce}"`, "g"))).toHaveLength(2);
    expect(getWebviewHtml(base, source)).not.toBe(html);
  });
});
