import * as os from "os";
import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ConfigurationEvent = { affectsConfiguration: (section: string) => boolean };

type ProviderLike = {
  onDidChangeMcpServerDefinitions?: (listener: () => void) => { dispose(): void };
  provideMcpServerDefinitions: () => Array<{
    label: string;
    command: string;
    args: string[];
    version?: string;
  }>;
};

const state = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  configListeners: [] as Array<(event: ConfigurationEvent) => void>,
  providers: new Map<string, ProviderLike>(),
  registrationDispose: vi.fn(),
  findExecutable: vi.fn<(name: string, env?: NodeJS.ProcessEnv) => string | undefined>(),
}));

vi.mock("vscode", () => {
  class Disposable {
    constructor(private readonly callOnDispose: () => void) {}
    static from(...items: Array<{ dispose(): void }>): Disposable {
      return new Disposable(() => items.forEach((item) => item.dispose()));
    }
    dispose(): void {
      this.callOnDispose();
    }
  }
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: T): void {
      for (const listener of this.listeners) listener(value);
    }
    dispose(): void {
      this.listeners.clear();
    }
  }
  class McpStdioServerDefinition {
    constructor(
      public readonly label: string,
      public command: string,
      public args: string[] = [],
      public env: Record<string, string | number | null> = {},
      public version?: string
    ) {}
  }
  return {
    Disposable,
    EventEmitter,
    McpStdioServerDefinition,
    lm: {
      registerMcpServerDefinitionProvider: vi.fn((id: string, provider: ProviderLike) => {
        state.providers.set(id, provider);
        return { dispose: state.registrationDispose };
      }),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: (key: string, fallback: unknown) => state.config[key] ?? fallback,
      })),
      onDidChangeConfiguration: vi.fn((listener: (event: ConfigurationEvent) => void) => {
        state.configListeners.push(listener);
        return { dispose: vi.fn() };
      }),
    },
  };
});

vi.mock("../utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils")>()),
  findExecutable: state.findExecutable,
}));

import * as vscode from "vscode";
import { registerMcpServerProvider } from "../mcpServer";
import { MCP_PROVIDER_ID, PYXEL_MCP_VERSION } from "../utils";

function outputChannel() {
  return { appendLine: vi.fn() } as unknown as vscode.OutputChannel;
}

function provider(): ProviderLike {
  const registered = state.providers.get(MCP_PROVIDER_ID);
  if (!registered) throw new Error("provider not registered");
  return registered;
}

beforeEach(() => {
  state.config = {};
  state.configListeners = [];
  state.providers.clear();
  state.registrationDispose.mockReset();
  state.findExecutable.mockReset();
});

describe("registerMcpServerProvider", () => {
  it("offers the pinned pyxel-mcp through uvx when uv is installed", () => {
    state.findExecutable.mockReturnValue("/usr/local/bin/uvx");
    registerMcpServerProvider(outputChannel());

    const definitions = provider().provideMcpServerDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0].label).toBe("Pyxel");
    expect(definitions[0].command).toBe("/usr/local/bin/uvx");
    expect(definitions[0].args).toEqual([
      "--from",
      `pyxel-mcp==${PYXEL_MCP_VERSION}`,
      "pyxel-mcp",
    ]);
    expect(definitions[0].version).toBe(PYXEL_MCP_VERSION);
  });

  it("also looks in uv's user bin directory, which may be missing from PATH", () => {
    state.findExecutable.mockReturnValue(undefined);
    registerMcpServerProvider(outputChannel());

    provider().provideMcpServerDefinitions();

    const [name, env] = state.findExecutable.mock.calls[0];
    expect(name).toBe("uvx");
    expect(env?.PATH?.split(path.delimiter)).toContain(path.join(os.homedir(), ".local", "bin"));
  });

  it("offers nothing and explains once when uvx is missing", () => {
    state.findExecutable.mockReturnValue(undefined);
    const channel = outputChannel();
    registerMcpServerProvider(channel);

    expect(provider().provideMcpServerDefinitions()).toEqual([]);
    expect(provider().provideMcpServerDefinitions()).toEqual([]);

    expect(channel.appendLine).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(channel.appendLine).mock.calls[0][0])).toContain("restart VS Code");
  });

  it("offers nothing when pyxel.mcp.enabled is false", () => {
    state.config["mcp.enabled"] = false;
    state.findExecutable.mockReturnValue("/usr/local/bin/uvx");
    const channel = outputChannel();
    registerMcpServerProvider(channel);

    expect(provider().provideMcpServerDefinitions()).toEqual([]);
    expect(state.findExecutable).not.toHaveBeenCalled();
    expect(channel.appendLine).not.toHaveBeenCalled();
  });

  it("announces a change only when the pyxel.mcp settings change", () => {
    registerMcpServerProvider(outputChannel());
    const changes = vi.fn();
    provider().onDidChangeMcpServerDefinitions?.(changes);

    state.configListeners[0]({ affectsConfiguration: (s) => s === "pyxel.autoReload" });
    expect(changes).not.toHaveBeenCalled();
    state.configListeners[0]({ affectsConfiguration: (s) => s === "pyxel.mcp" });
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it("disposes the registration with the returned disposable", () => {
    registerMcpServerProvider(outputChannel()).dispose();

    expect(state.registrationDispose).toHaveBeenCalledTimes(1);
  });

  it("degrades to a note when the editor lacks the MCP API", () => {
    const original = vscode.lm.registerMcpServerDefinitionProvider;
    (vscode.lm as { registerMcpServerDefinitionProvider?: unknown })
      .registerMcpServerDefinitionProvider = undefined;
    const channel = outputChannel();
    try {
      const disposable = registerMcpServerProvider(channel);
      disposable.dispose();
    } finally {
      vscode.lm.registerMcpServerDefinitionProvider = original;
    }

    expect(state.providers.size).toBe(0);
    expect(String(vi.mocked(channel.appendLine).mock.calls[0][0])).toContain("no MCP server");
  });
});
