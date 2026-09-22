import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../messages";
import {
  encodeBase64,
  keySteps,
  PyxelRunner,
  RUNTIME_LOAD_ERROR,
  RUNTIME_START_TIMEOUT_MS,
  start,
  RUN_SCRIPT,
  toErrorMessage,
  type HostMessage,
  type RunnerHost,
  type WebviewMessage,
} from "../webview/main";

// The Webview compiles on its own, so the protocol is declared twice. These
// fail to type-check the moment the two sides drift apart.
describe("message protocol", () => {
  it("matches the host side in both directions", () => {
    expectTypeOf<HostMessage>().toEqualTypeOf<HostToWebviewMessage>();
    expectTypeOf<WebviewMessage>().toEqualTypeOf<WebviewToHostMessage>();
  });
});

describe("encodeBase64", () => {
  it("encodes bytes the way the host decodes them", () => {
    const bytes = new TextEncoder().encode("Pyxel");

    expect(encodeBase64(bytes)).toBe(Buffer.from("Pyxel").toString("base64"));
  });

  it("encodes payloads larger than one chunk", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, index) => index % 256);

    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });

  it("encodes an empty file", () => {
    expect(encodeBase64(new Uint8Array())).toBe("");
  });
});

describe("keySteps", () => {
  it("wraps the key in Ctrl, which is what Pyxel reads on every platform", () => {
    const { press, release } = keySteps({ code: "KeyS", key: "s", shift: false });

    expect(press).toEqual([
      { type: "keydown", code: "ControlLeft", key: "Control", ctrlKey: true, shiftKey: false },
      { type: "keydown", code: "KeyS", key: "s", ctrlKey: true, shiftKey: false },
    ]);
    expect(release).toEqual([
      { type: "keyup", code: "KeyS", key: "s", ctrlKey: false, shiftKey: false },
      { type: "keyup", code: "ControlLeft", key: "Control", ctrlKey: false, shiftKey: false },
    ]);
  });

  it("presses and releases Shift around the key when asked", () => {
    const { press, release } = keySteps({ code: "KeyZ", key: "z", shift: true });

    expect(press.map((step) => step.code))
      .toEqual(["ControlLeft", "ShiftLeft", "KeyZ"]);
    expect(press[2]).toMatchObject({ ctrlKey: true, shiftKey: true });
    expect(release.map((step) => step.code))
      .toEqual(["KeyZ", "ShiftLeft", "ControlLeft"]);
  });
});

describe("toErrorMessage", () => {
  it("prefers the error message and falls back to the value", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
    expect(toErrorMessage({ message: "" })).toBe("[object Object]");
    expect(toErrorMessage("plain")).toBe("plain");
    expect(toErrorMessage(undefined)).toBe("undefined");
  });
});

function createRunner(overrides: Partial<RunnerHost> = {}) {
  const host = {
    isRuntimeLoaded: vi.fn(() => true),
    installSaveBridge: vi.fn(),
    launch: vi.fn(async () => {}),
    reset: vi.fn(async () => {}),
    reportFatal: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
  return { host, runner: new PyxelRunner(host) };
}

describe("PyxelRunner", () => {
  it("launches the first script and resets for later ones", async () => {
    const { host, runner } = createRunner();

    await runner.run("first");
    await runner.run("second");

    expect(host.launch).toHaveBeenCalledExactlyOnceWith("first");
    expect(host.reset).toHaveBeenCalledExactlyOnceWith("second");
    expect(host.installSaveBridge).toHaveBeenCalledTimes(2);
  });

  it("reports a missing runtime without touching Pyxel", async () => {
    const { host, runner } = createRunner({ isRuntimeLoaded: vi.fn(() => false) });

    await runner.run("script");

    expect(host.reportFatal).toHaveBeenCalledWith(RUNTIME_LOAD_ERROR);
    expect(host.launch).not.toHaveBeenCalled();
  });

  it("runs only the newest script queued during a launch", async () => {
    let finishLaunch = () => {};
    const launch = vi.fn(() => new Promise<void>((resolve) => {
      finishLaunch = resolve;
    }));
    const { host, runner } = createRunner({ launch });

    const first = runner.run("first");
    void runner.run("second");
    void runner.run("third");
    finishLaunch();
    await first;

    expect(launch).toHaveBeenCalledExactlyOnceWith("first");
    expect(host.reset).toHaveBeenCalledExactlyOnceWith("third");
  });

  it("drops the queue when the launch fails", async () => {
    let failLaunch = (_error: Error) => {};
    const launch = vi.fn(() => new Promise<void>((_resolve, reject) => {
      failLaunch = reject;
    }));
    const { host, runner } = createRunner({ launch });

    const first = runner.run("first");
    void runner.run("second");
    failLaunch(new Error("no wasm"));
    await first;

    expect(host.reportFatal)
      .toHaveBeenCalledWith("Failed to launch Pyxel: no wasm");
    expect(host.reset).not.toHaveBeenCalled();
  });

  it("reloads the page before retrying a failed reset", async () => {
    const reset = vi.fn()
      .mockRejectedValueOnce(new Error("stuck"))
      .mockResolvedValueOnce(undefined);
    const { host, runner } = createRunner({ reset });

    await runner.run("first");
    await runner.run("second");
    await runner.run("third");

    expect(host.reportFatal)
      .toHaveBeenCalledWith("Failed to reset Pyxel: stuck");
    expect(reset).toHaveBeenCalledExactlyOnceWith("second");
    expect(host.reload).toHaveBeenCalledOnce();
  });

  it("times out a stalled launch and never starts a second runtime on that page", async () => {
    vi.useFakeTimers();
    let finishLaunch = () => {};
    const launch = vi.fn(() => new Promise<void>((resolve) => { finishLaunch = resolve; }));
    const { host, runner } = createRunner({ launch });
    try {
      const first = runner.run("first");
      await runner.run("queued");
      await vi.advanceTimersByTimeAsync(RUNTIME_START_TIMEOUT_MS);
      await first;
      expect(host.reportFatal).toHaveBeenCalledWith(expect.stringContaining("did not finish loading"));
      await runner.run("retry");
      finishLaunch();
      await Promise.resolve();
      expect(host.reload).toHaveBeenCalledOnce();
      expect(host.launch).toHaveBeenCalledOnce();
      expect(host.reset).not.toHaveBeenCalled();
    } finally {
      finishLaunch();
      vi.useRealTimers();
    }
  });
});

describe("Webview runtime messages", () => {
  it("keeps each launch's files intact while newer requests are queued", async () => {
    let receive = (_event: { data: HostMessage }) => {};
    let finishLaunch = () => {};
    const view = {
      addEventListener: (_name: string, listener: typeof receive) => {
        receive = listener;
      },
      pyxelContext: { params: { script: "" } },
      _pendingFiles: undefined as Record<string, string> | undefined,
      _pendingScriptName: undefined as string | undefined,
    };
    const launch = vi.fn(() => new Promise<void>((resolve) => {
      finishLaunch = resolve;
    }));
    const reset = vi.fn(async () => {});
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;
    vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: vi.fn() }));
    vi.stubGlobal("launchPyxel", launch);
    vi.stubGlobal("resetPyxel", reset);
    vi.stubGlobal("window", view);
    vi.stubGlobal("document", {
      body: {}, head: {}, querySelector: () => null,
    });
    vi.stubGlobal("MutationObserver", class { observe() {} });
    try {
      start();
      receive({ data: { command: "run", sessionId: 1, scriptName: "first.py", files: { "first.py": "first" } } });
      receive({ data: { command: "edit", fileName: "unused.pyxres", fileData: null, palData: null } });
      receive({ data: { command: "run", sessionId: 3, scriptName: "last.py", files: { "last.py": "last" } } });

      expect(view._pendingScriptName).toBe("first.py");
      expect(view._pendingFiles).toEqual({ "first.py": "first" });
      finishLaunch();
      await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
      expect(view._pendingScriptName).toBe("last.py");
      expect(view._pendingFiles).toEqual({ "last.py": "last" });
      expect(view.pyxelContext.params.script).toBe(RUN_SCRIPT);
    } finally {
      finishLaunch();
      await vi.waitFor(() => expect(reset).toHaveBeenCalledOnce());
      console.error = originalConsoleError;
      console.log = originalConsoleLog;
      vi.unstubAllGlobals();
    }
  });

  it("keeps the originating session on captured files after switching runs", async () => {
    const harness = webviewHarness();
    try {
      await harness.send({ command: "run", sessionId: 11, scriptName: "one.py", files: {} });
      const firstSave = harness.view._savePyxelFile!;
      await harness.send({ command: "run", sessionId: 12, scriptName: "two.py", files: {} });
      firstSave("/tmp/old.png");
      harness.view._savePyxelFile!("/tmp/new.png");
      expect(harness.post).toHaveBeenCalledWith({ command: "saved", sessionId: 11, fileName: "old.png", data: "AQID" });
      expect(harness.post).toHaveBeenCalledWith({ command: "saved", sessionId: 12, fileName: "new.png", data: "AQID" });
    } finally {
      harness.dispose();
    }
  });

  it("preserves POSIX backslashes in resource saves without inheriting a run session", async () => {
    const harness = webviewHarness();
    try {
      await harness.send({ command: "run", sessionId: 9, scriptName: "game.py", files: {} });
      await harness.send({ command: "edit", fileName: "a\\b.pyxres", fileData: null, palData: null });
      harness.view._savePyxelFile!("/pyxel_working_directory/a\\b.pyxres");
      expect(harness.post).toHaveBeenCalledWith({ command: "saved", fileName: "a\\b.pyxres", data: "AQID" });
    } finally {
      harness.dispose();
    }
  });

  it("reports resource read failures without sending incomplete save data", async () => {
    const harness = webviewHarness();
    try {
      await harness.send({ command: "edit", fileName: "game.pyxres", fileData: null, palData: null });
      harness.readFile.mockImplementation(() => { throw new Error("read failed"); });
      harness.view._savePyxelFile!("/pyxel_working_directory/game.pyxres");
      expect(harness.post).toHaveBeenCalledWith({ command: "error", message: "Failed to save /pyxel_working_directory/game.pyxres: read failed" });
      expect(harness.post.mock.calls.some(([message]) => message.command === "saved")).toBe(false);
    } finally {
      harness.dispose();
    }
  });

  it("forwards standard output without treating it as an error", () => {
    const quiet = vi.spyOn(console, "log").mockImplementation(() => {});
    const harness = webviewHarness();
    try {
      console.log("hello", 42);
      expect(harness.post).toHaveBeenCalledWith({ command: "log", message: "hello 42" });
      expect(harness.post.mock.calls.some(([message]) => message.command === "error")).toBe(false);
    } finally {
      harness.dispose();
      quiet.mockRestore();
    }
  });
});

function webviewHarness() {
  let receive = (_event: { data: HostMessage }) => {};
  const post = vi.fn<(message: WebviewMessage) => void>();
  const readFile = vi.fn(() => new Uint8Array([1, 2, 3]));
  const view = {
    addEventListener: (_name: string, listener: typeof receive) => { receive = listener; },
    pyxelContext: { params: { script: "" }, pyodide: { FS: { readFile } } },
    _savePyxelFile: undefined as Window["_savePyxelFile"],
  };
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: post }));
  vi.stubGlobal("launchPyxel", vi.fn(async () => {}));
  vi.stubGlobal("resetPyxel", vi.fn(async () => {}));
  vi.stubGlobal("window", view);
  vi.stubGlobal("document", { body: {}, head: {}, querySelector: () => null });
  vi.stubGlobal("MutationObserver", class { observe() {} });
  start();
  return {
    post, readFile, view,
    async send(message: HostMessage) {
      receive({ data: message });
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    dispose() {
      console.error = originalConsoleError;
      console.log = originalConsoleLog;
      vi.unstubAllGlobals();
    },
  };
}
