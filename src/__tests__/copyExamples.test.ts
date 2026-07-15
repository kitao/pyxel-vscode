import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import * as fs from "fs";
import type { ClientRequest, IncomingMessage } from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import {
  EXAMPLES_PREFIX,
  copyExamples,
  getExamplesTreeUrl,
  selectExampleFiles,
} from "../copyExamples";
import { PYXEL_VERSION } from "../utils";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("https")>();
  return { ...actual, get: vi.fn(actual.get) };
});

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
  const actualFs = await vi.importActual<typeof import("fs")>("fs");
  const actualHttps = await vi.importActual<typeof import("https")>("https");
  vi.mocked(fs.renameSync).mockImplementation(actualFs.renameSync);
  vi.mocked(https.get).mockReset().mockImplementation(actualHttps.get);
});

function mockResponse(
  statusCode: number,
  body: string,
  headers: IncomingMessage["headers"] = {}
): void {
  const fakeGet = (
    _url: string | URL,
    _options: https.RequestOptions,
    callback: (response: IncomingMessage) => void
  ) => {
    const stream = new PassThrough();
    const response = stream as unknown as IncomingMessage;
    response.statusCode = statusCode;
    response.headers = headers;
    const request = new EventEmitter() as unknown as ClientRequest;
    request.setTimeout = vi.fn().mockReturnValue(request);
    request.destroy = vi.fn().mockReturnValue(request);
    queueMicrotask(() => {
      callback(response);
      stream.end(body);
    });
    return request;
  };
  vi.mocked(https.get).mockImplementationOnce(fakeGet as typeof https.get);
}

function mockJsonResponse(body: string): void {
  mockResponse(200, body);
}

describe("copyExamples helpers", () => {
  it("uses the pinned Pyxel version for the GitHub tree URL", () => {
    expect(getExamplesTreeUrl()).toBe(
      `https://api.github.com/repos/kitao/pyxel/git/trees/v${PYXEL_VERSION}?recursive=1`
    );
  });

  it("selects example blobs and skips pycache entries", () => {
    const result = selectExampleFiles({
      tree: [
        { type: "blob", path: `${EXAMPLES_PREFIX}01_hello.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}assets/player.pyxres` },
        { type: "blob", path: `${EXAMPLES_PREFIX}__pycache__/ignored.pyc` },
        { type: "tree", path: `${EXAMPLES_PREFIX}nested` },
        { type: "blob", path: "README.md" },
      ],
    });

    expect(result).toEqual([
      `${EXAMPLES_PREFIX}01_hello.py`,
      `${EXAMPLES_PREFIX}assets/player.pyxres`,
    ]);
  });

  it("rejects tree entries with unsafe path segments", () => {
    const result = selectExampleFiles({
      tree: [
        { type: "blob", path: `${EXAMPLES_PREFIX}../escape.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}a//double.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}a\\..\\escape.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}ok.py` },
      ],
    });

    expect(result).toEqual([`${EXAMPLES_PREFIX}ok.py`]);
  });

  it("rejects malformed GitHub tree responses", () => {
    expect(() => selectExampleFiles({})).toThrowError(
      new Error("Invalid GitHub tree response")
    );
    expect(() => selectExampleFiles({ tree: "not an array" })).toThrowError(
      new Error("Invalid GitHub tree response")
    );
  });

  it("rejects truncated GitHub tree responses", () => {
    expect(() => selectExampleFiles({
      truncated: true,
      tree: [{ type: "blob", path: `${EXAMPLES_PREFIX}01_hello.py` }],
    })).toThrowError(new Error("GitHub tree response is truncated"));
  });

  it("rejects GitHub tree responses without examples", () => {
    expect(() => selectExampleFiles({ tree: [] })).toThrowError(
      new Error("GitHub tree response contains no Pyxel examples")
    );
  });

  it("preserves existing examples when replacement fails", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-copy-test-"));
    const examplesDir = path.join(tmpDir, "pyxel_examples");
    const oldFile = path.join(examplesDir, "old.py");
    fs.mkdirSync(examplesDir);
    fs.writeFileSync(oldFile, "old");
    mockJsonResponse(JSON.stringify({
      tree: [{ type: "blob", path: `${EXAMPLES_PREFIX}new.py` }],
    }));
    mockResponse(200, "new");

    const actualFs = await vi.importActual<typeof import("fs")>("fs");
    vi.mocked(fs.renameSync).mockImplementation((source, destination) => {
      if (path.basename(String(source)).startsWith(".pyxel_examples-") &&
          destination === examplesDir) {
        throw new Error("rename failed");
      }
      return actualFs.renameSync(source, destination);
    });

    const showErrorMessage = vi.fn();
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const vscodeApi = {
      ProgressLocation: { Notification: 15 },
      window: {
        showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: tmpDir }]),
        showWarningMessage: vi.fn().mockResolvedValue("Replace"),
        showInformationMessage: vi.fn(),
        showErrorMessage,
        withProgress: vi.fn(async (
          _options: unknown,
          task: (progress: unknown, cancellationToken: typeof token) => Promise<void>
        ) => task({}, token)),
      },
    } as unknown as Parameters<typeof copyExamples>[0];

    await copyExamples(vscodeApi);

    expect(fs.existsSync(oldFile)).toBe(true);
    expect(fs.readdirSync(tmpDir)).toEqual(["pyxel_examples"]);
    expect(showErrorMessage).toHaveBeenCalledWith(
      "Failed to copy examples: rename failed"
    );
  });

  it("aborts an active download when copying is cancelled", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-copy-test-"));
    mockJsonResponse(JSON.stringify({
      tree: [{ type: "blob", path: `${EXAMPLES_PREFIX}new.py` }],
    }));

    let responseStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { responseStarted = resolve; });
    let downloadStream: PassThrough | undefined;
    let downloadSignal: AbortSignal | undefined;
    const pendingGet = (
      _url: string | URL,
      options: https.RequestOptions,
      callback: (response: IncomingMessage) => void
    ) => {
      downloadSignal = options.signal;
      downloadStream = new PassThrough();
      const response = downloadStream as unknown as IncomingMessage;
      response.statusCode = 200;
      response.headers = {};
      const request = new EventEmitter() as unknown as ClientRequest;
      request.setTimeout = vi.fn().mockReturnValue(request);
      request.destroy = vi.fn().mockReturnValue(request);
      queueMicrotask(() => {
        callback(response);
        responseStarted?.();
      });
      return request;
    };
    vi.mocked(https.get).mockImplementationOnce(pendingGet as typeof https.get);

    const cancellationListeners = new Set<() => void>();
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn((listener: () => void) => {
        cancellationListeners.add(listener);
        return { dispose: () => cancellationListeners.delete(listener) };
      }),
    };
    const showErrorMessage = vi.fn();
    const showInformationMessage = vi.fn();
    const vscodeApi = {
      ProgressLocation: { Notification: 15 },
      window: {
        showOpenDialog: vi.fn().mockResolvedValue([{ fsPath: tmpDir }]),
        showWarningMessage: vi.fn(),
        showInformationMessage,
        showErrorMessage,
        withProgress: vi.fn(async (
          _options: unknown,
          task: (progress: unknown, cancellationToken: typeof token) => Promise<void>
        ) => task({}, token)),
      },
    } as unknown as Parameters<typeof copyExamples>[0];

    const copyPromise = copyExamples(vscodeApi);
    await started;
    token.isCancellationRequested = true;
    for (const listener of cancellationListeners) listener();
    downloadStream?.end("new");
    await copyPromise;

    expect(downloadSignal?.aborted).toBe(true);
    expect(showInformationMessage).not.toHaveBeenCalled();
    expect(showErrorMessage).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmpDir, "pyxel_examples"))).toBe(false);
    expect(cancellationListeners.size).toBe(0);
  });
});
