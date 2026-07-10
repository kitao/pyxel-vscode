import { describe, it, expect } from "vitest";
import { PYXEL_VERSION } from "../utils";
import { getWebviewHtml } from "../webviewHtml";

describe("getWebviewHtml", () => {
  it("returns valid HTML with doctype", () => {
    const html = getWebviewHtml();
    expect(html).toMatch(/^<!doctype html>/);
  });

  it("includes a CSP meta tag", () => {
    const html = getWebviewHtml();
    expect(html).toContain("Content-Security-Policy");
  });

  it("includes a nonce in script tag", () => {
    const html = getWebviewHtml();
    const match = html.match(/nonce="([0-9a-f]{32})"/);
    expect(match).not.toBeNull();
  });

  it("uses different nonces on each call", () => {
    const html1 = getWebviewHtml();
    const html2 = getWebviewHtml();
    const nonce1 = html1.match(/nonce="([0-9a-f]{32})"/)![1];
    const nonce2 = html2.match(/nonce="([0-9a-f]{32})"/)![1];
    expect(nonce1).not.toBe(nonce2);
  });

  it("includes the nonce in the CSP script-src directive", () => {
    const html = getWebviewHtml();
    const nonce = html.match(/nonce="([0-9a-f]{32})"/)![1];
    expect(html).toContain(`'nonce-${nonce}'`);
  });

  it("loads pyxel.js from CDN", () => {
    const html = getWebviewHtml();
    expect(html).toContain(
      `https://cdn.jsdelivr.net/gh/kitao/pyxel@v${PYXEL_VERSION}/wasm/pyxel.js`
    );
  });

  it("includes acquireVsCodeApi call", () => {
    const html = getWebviewHtml();
    expect(html).toContain("acquireVsCodeApi()");
  });

  it("posts ready message on load", () => {
    const html = getWebviewHtml();
    expect(html).toContain('postMessage({ command: "ready" })');
  });

  it("passes file names to Python as data instead of interpolating source", () => {
    const html = getWebviewHtml();
    expect(html).not.toContain("pyEsc");
    expect(html).toContain("js.window._pendingScriptName");
    expect(html).toContain("js.window._pendingFileName");
    expect(html).toContain("run_python_script(js.window._pendingScriptName)");
  });

  it("overrides Pyxel browser save with VS Code save bridge", () => {
    const html = getWebviewHtml();
    expect(html).toContain("const saveBridge = function(filename)");
    expect(html).toContain("window.pyxelContext?.pyodide?.FS");
    expect(html).toContain(
      'postMessage({ command: "saved", fileName: basename, data: btoa(binary) })'
    );
  });

  it("forwards every Pyxel save to the host instead of filtering in the webview", () => {
    const html = getWebviewHtml();
    expect(html).not.toContain("_vscodeSaveFileName");
    expect(html).not.toContain("Ignoring unsupported Pyxel export");
  });

  it("installs the save bridge before Pyxel can replace the browser save hook", () => {
    const html = getWebviewHtml();
    expect(html).toContain('Object.defineProperty(window, "_savePyxelFile"');
    expect(html.indexOf("installSaveBridge();")).toBeLessThan(
      html.indexOf("await launchPyxel")
    );
  });

  it("clears the launch-in-progress state when Pyxel fails to start", () => {
    const html = getWebviewHtml();
    expect(html).toContain("Failed to launch Pyxel");
    expect(html).toContain("finally {");
    expect(html).toContain("launching = false;");
  });

  it("handles run, edit, play, and key commands", () => {
    const html = getWebviewHtml();
    expect(html).toContain('"run"');
    expect(html).toContain('"edit"');
    expect(html).toContain('"play"');
    expect(html).toContain('"key"');
  });

  it("removes files deleted from the project before re-running", () => {
    const html = getWebviewHtml();
    expect(html).toContain("_staleFiles");
    expect(html).toContain("os.remove(name)");
    expect(html).toContain("prevRunFiles");
  });

  it("shows a clear message when the Pyxel runtime fails to load", () => {
    const html = getWebviewHtml();
    expect(html).toContain('id="pyxel-error"');
    expect(html).toContain("Failed to load the Pyxel runtime");
    expect(html).toContain('typeof launchPyxel === "undefined"');
  });

  it("does not carry the ignored unsafe-inline in script-src", () => {
    const html = getWebviewHtml();
    const scriptSrc = html.match(/script-src[^;]*/)![0];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'unsafe-eval'");
  });
});
