import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../messages";
import {
  encodeBase64,
  keySteps,
  PyxelRunner,
  RUNTIME_LOAD_ERROR,
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
    reportError: vi.fn(),
    reportFatal: vi.fn(),
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
    expect(host.installSaveBridge).toHaveBeenCalledOnce();
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

    expect(host.reportError)
      .toHaveBeenCalledWith("Failed to launch Pyxel: no wasm");
    expect(host.reset).not.toHaveBeenCalled();
  });

  it("stays usable after a failed reset", async () => {
    const reset = vi.fn()
      .mockRejectedValueOnce(new Error("stuck"))
      .mockResolvedValueOnce(undefined);
    const { host, runner } = createRunner({ reset });

    await runner.run("first");
    await runner.run("second");
    await runner.run("third");

    expect(host.reportError)
      .toHaveBeenCalledWith("Failed to reset Pyxel: stuck");
    expect(reset).toHaveBeenLastCalledWith("third");
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
      receive({ data: { command: "run", scriptName: "first.py", files: { "first.py": "first" } } });
      receive({ data: { command: "edit", fileName: "unused.pyxres", fileData: null, palData: null } });
      receive({ data: { command: "run", scriptName: "last.py", files: { "last.py": "last" } } });

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
      vi.unstubAllGlobals();
    }
  });
});
