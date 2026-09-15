import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PYXEL_VERSION } from "../utils";
import { getWebviewHtml, readWebviewScript } from "../webviewHtml";

const SCRIPT = "export const marker = 1;";

describe("getWebviewHtml", () => {
  it("returns a complete HTML document", () => {
    const html = getWebviewHtml(SCRIPT);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain('<div id="pyxel-error" role="alert">');
  });

  it("loads the pinned Pyxel runtime from the CDN", () => {
    expect(getWebviewHtml(SCRIPT)).toContain(
      `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}/wasm/pyxel.js`
    );
  });

  it("inlines the compiled script as a module", () => {
    const html = getWebviewHtml(SCRIPT);
    const nonce = html.match(/<script type="module" nonce="(\w+)">/)?.[1];

    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(html).toContain(`\n${SCRIPT}\n`);
  });

  it("allows only the inlined script and the CDN to run", () => {
    const html = getWebviewHtml(SCRIPT);
    const nonce = html.match(/<script type="module" nonce="(\w+)">/)?.[1];
    const scriptSrc = html.match(/script-src ([^;]+);/)?.[1];

    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).toContain("https://cdn.jsdelivr.net");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("keeps an inlined </script in the source from ending the tag", () => {
    const html = getWebviewHtml('const marker = "</script>";');

    expect(html).toContain('const marker = "<\\/script>";');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });

  it("uses a fresh nonce for every panel", () => {
    expect(getWebviewHtml(SCRIPT)).not.toBe(getWebviewHtml(SCRIPT));
  });
});

describe("readWebviewScript", () => {
  it("reads the separately compiled Webview module", () => {
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-ext-"));
    fs.mkdirSync(path.join(extensionPath, "dist", "webview"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(extensionPath, "dist", "webview", "main.js"),
      SCRIPT
    );

    expect(readWebviewScript(extensionPath)).toBe(SCRIPT);

    fs.rmSync(extensionPath, { recursive: true, force: true });
  });

  it("throws when the extension was not compiled", () => {
    expect(() => readWebviewScript("/nowhere")).toThrow();
  });
});
