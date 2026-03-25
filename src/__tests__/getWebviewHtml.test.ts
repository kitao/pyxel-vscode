import { describe, it, expect } from "vitest";
import { getWebviewHtml } from "../utils";

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
      "https://cdn.jsdelivr.net/gh/kitao/pyxel@main/wasm/pyxel.js"
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

  it("contains the pyEsc escape function", () => {
    const html = getWebviewHtml();
    expect(html).toContain("function pyEsc(s)");
  });

  it("handles run, edit, play, and key commands", () => {
    const html = getWebviewHtml();
    expect(html).toContain('"run"');
    expect(html).toContain('"edit"');
    expect(html).toContain('"play"');
    expect(html).toContain('"key"');
  });
});
