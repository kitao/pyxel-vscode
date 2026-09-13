import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MCP_PROVIDER_ID, PYXEL_MCP_VERSION, findExecutable } from "./utils";

const UV_INSTALL_URL = "https://docs.astral.sh/uv/getting-started/installation/";

// Offer pyxel-mcp to AI agents in VS Code without manual configuration. The
// server runs through uvx, so it is announced only when uv is installed.
export function registerMcpServerProvider(
  outputChannel: vscode.OutputChannel
): vscode.Disposable {
  if (typeof vscode.lm?.registerMcpServerDefinitionProvider !== "function") {
    outputChannel.appendLine(
      "This editor has no MCP server definition API, so the Pyxel MCP server " +
      "is not offered to AI agents."
    );
    return new vscode.Disposable(() => {});
  }

  const changed = new vscode.EventEmitter<void>();
  let missingUvReported = false;

  const configuration = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("pyxel.mcp")) changed.fire();
  });

  const provider: vscode.McpServerDefinitionProvider = {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions: () => {
      const enabled = vscode.workspace
        .getConfiguration("pyxel")
        .get<boolean>("mcp.enabled", true);
      if (!enabled) return [];

      const uvx = findUvx();
      if (!uvx) {
        if (!missingUvReported) {
          missingUvReported = true;
          outputChannel.appendLine(
            "uvx was not found on PATH, so the Pyxel MCP server is not " +
            `offered to AI agents. Install uv (${UV_INSTALL_URL}), then ` +
            "restart VS Code so it sees the new PATH."
          );
        }
        return [];
      }
      return [
        new vscode.McpStdioServerDefinition(
          "Pyxel",
          uvx,
          ["--from", `pyxel-mcp==${PYXEL_MCP_VERSION}`, "pyxel-mcp"],
          {},
          PYXEL_MCP_VERSION
        ),
      ];
    },
  };

  const registration = vscode.lm.registerMcpServerDefinitionProvider(
    MCP_PROVIDER_ID,
    provider
  );
  return vscode.Disposable.from(registration, configuration, changed);
}

// uv's installer puts uvx in ~/.local/bin, which a VS Code started before the
// installation may not have on its PATH yet.
function findUvx(): string | undefined {
  const userBin = path.join(os.homedir(), ".local", "bin");
  const searchPath = [process.env.PATH, userBin].filter(Boolean).join(path.delimiter);
  return findExecutable("uvx", { ...process.env, PATH: searchPath });
}
