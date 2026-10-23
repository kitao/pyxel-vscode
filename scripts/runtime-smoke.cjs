const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { chromium } = require(process.env.RUNTIME_TEST_MODULE);
const { getWebviewHtml } = require("../dist/webviewHtml.js");
const { PYXEL_VERSION } = require("../dist/utils.js");
const webviewScript = fs.readFileSync("dist/webview/main.js", "utf8");
const files = {};
for (const name of ["first", "second"]) {
  const python = [
    "import pyxel",
    'print("SMOKE_' + name.toUpperCase() + '_RUNTIME", pyxel.VERSION)',
    'pyxel.init(160, 120, title="Smoke ' + name + '")',
    "def update():",
    "    pass",
    "def draw():",
    "    pyxel.cls(" + (name === "first" ? "1" : "3") + ")",
    '    pyxel.text(12, 52, "' + name.toUpperCase() + ' RUNTIME OK", 7)',
    "pyxel.run(update, draw)",
  ].join("\n");
  files[name + ".py"] = Buffer.from(python).toString("base64");
}
const harness = [
  "window.smokeMessages=[];",
  "window.smokeCsp=[];",
  "window.acquireVsCodeApi=()=>({postMessage(message){",
  "window.smokeMessages.push(message);",
  "if(message.command==='ready'){",
  "window.postMessage({command:'run',sessionId:1,scriptName:'first.py',files:" + JSON.stringify(files) + "},'*');",
  "setTimeout(()=>window.postMessage({command:'run',sessionId:2,scriptName:'second.py',files:" + JSON.stringify(files) + "},'*'),50);",
  "}}});",
  "window.addEventListener('securitypolicyviolation',e=>window.smokeCsp.push({blockedURI:e.blockedURI,directive:e.violatedDirective}));",
].join("\n");
const html = getWebviewHtml(harness + "\n" + webviewScript);
const server = http.createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end(html);
});
(async () => {
  fs.mkdirSync("runtime-verification", { recursive: true });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const consoleMessages = [];
  const requests = [];
  page.on("console", message => consoleMessages.push(message.type() + ": " + message.text()));
  page.on("pageerror", error => consoleMessages.push("PAGEERROR: " + error.stack));
  page.on("request", request => {
    const url = request.url();
    if (url.startsWith("https://kitao.dev") || url.startsWith("https://cdn.jsdelivr.net")) requests.push(url);
  });
  try {
    await page.goto("http://127.0.0.1:" + server.address().port, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() =>
      document.title === "Smoke second" &&
      window.smokeMessages.some(m => m.command === "log" && m.message.includes("SMOKE_SECOND_RUNTIME")),
      null, { timeout: 120000 });
    const state = await page.evaluate(() => ({
      title: document.title,
      messages: window.smokeMessages,
      csp: window.smokeCsp,
      canvases: document.querySelectorAll("canvas").length,
      alert: document.querySelector("#pyxel-error").textContent,
    }));
    assert.ok(state.messages.some(m => m.command === "log" && m.message.includes("SMOKE_SECOND_RUNTIME " + PYXEL_VERSION)));
    assert.equal(state.canvases, 1);
    assert.equal(state.alert, "");
    assert.deepEqual(state.csp, []);
    assert.deepEqual(state.messages.filter(m => m.command === "error"), []);
    assert.ok(requests.includes("https://kitao.dev/pyxel/" + PYXEL_VERSION + "/pyxel.js"));
    await page.screenshot({ path: "runtime-verification/game.png" });
    console.log("PASS: pinned runtime " + PYXEL_VERSION + ", game startup, queued script switching, canvas, and CSP.");

    await page.evaluate(() => window.postMessage({
      command: "edit", fileName: "smoke.pyxres", fileData: null, palData: null,
    }, "*"));
    await page.waitForFunction(() =>
      document.title.includes("Pyxel Editor") && document.title.includes("smoke.pyxres"),
      null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.postMessage({
      command: "key", code: "KeyS", key: "s", shift: false,
    }, "*"));
    await page.waitForFunction(() => window.smokeMessages.some(m =>
      m.command === "saved" && m.fileName === "smoke.pyxres"),
      null, { timeout: 15000 });
    const saved = await page.evaluate(() => window.smokeMessages.find(m =>
      m.command === "saved" && m.fileName === "smoke.pyxres"));
    const bytes = Buffer.from(saved.data, "base64");
    assert.ok(bytes.length > 0);
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    await page.screenshot({ path: "runtime-verification/editor.png" });
    console.log("PASS: open a resource in Pyxel Editor and save it through the Webview bridge (" + bytes.length + " bytes).");
    const finalState = await page.evaluate(() => ({
      title: document.title, messages: window.smokeMessages, csp: window.smokeCsp,
      alert: document.querySelector("#pyxel-error").textContent,
    }));
    assert.equal(finalState.alert, "");
    // Pyodide probes optional Python sources and resource sidecars on the page
    // origin after a reset. The Webview intentionally blocks these HTTP lookups;
    // project files live in its in-memory filesystem instead.
    const localOrigin = new URL(page.url()).origin;
    const optionalPaths = new Set(["/first.py", "/second.py", "/smoke.pyxres", "/smoke.pyxpal"]);
    assert.ok(finalState.csp.every(item => {
      const url = new URL(item.blockedURI);
      return item.directive === "connect-src" && url.origin === localOrigin && optionalPaths.has(url.pathname);
    }), "no runtime asset or unexpected origin is blocked by CSP");
    console.log("PASS: CSP permits all runtime assets and blocks " + finalState.csp.length + " optional page-origin file probes.");
    assert.deepEqual(finalState.messages.filter(m => m.command === "error"), []);
    fs.writeFileSync("runtime-verification/results.json", JSON.stringify({ state, finalState, requests, consoleMessages }, null, 2));
  } catch (error) {
    await page.screenshot({ path: "runtime-verification/failure.png" });
    fs.writeFileSync("runtime-verification/failure.json", JSON.stringify({
      error: String(error), requests, consoleMessages,
      state: await page.evaluate(() => ({ title: document.title, messages: window.smokeMessages, csp: window.smokeCsp, body: document.body.innerText })),
    }, null, 2));
    console.error(consoleMessages.join("\n"));
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
