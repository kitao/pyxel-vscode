import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { MCP_PROVIDER_ID } from "../utils";

const EXTENSION_ID = "kitao.pyxel-vscode";

// Tabs appear a tick after the command that creates them resolves.
async function eventually(check: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return check();
}

function tabLabels(): string[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label));
}

// Smoke test against a real VS Code: everything that only the extension host
// can prove, such as activation, contribution loading, and API shapes.
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} is loaded in the test host`);
  await extension.activate();
  assert.ok(extension.isActive, "extension activates");

  const commands = new Set(await vscode.commands.getCommands(true));
  for (const command of extension.packageJSON.contributes.commands) {
    assert.ok(commands.has(command.command), `${command.command} is registered`);
  }

  const providers = extension.packageJSON.contributes.mcpServerDefinitionProviders;
  assert.deepStrictEqual(providers, [{ id: MCP_PROVIDER_ID, label: "Pyxel" }]);
  assert.strictEqual(typeof vscode.lm.registerMcpServerDefinitionProvider, "function");
  assert.strictEqual(typeof vscode.McpStdioServerDefinition, "function");

  const [skill] = extension.packageJSON.contributes.chatSkills;
  const skillPath = path.join(extension.extensionPath, skill.path);
  assert.ok(fs.existsSync(skillPath), `bundled skill exists at ${skill.path}`);
  assert.match(fs.readFileSync(skillPath, "utf8"), /^name: pyxel$/m);

  await vscode.commands.executeCommand(
    "workbench.action.openWalkthrough",
    `${EXTENSION_ID}#pyxel.gettingStarted`
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-smoke-"));
  const script = path.join(directory, "game.py");
  fs.writeFileSync(script, "import pyxel\n");
  await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(script));
  const opened = await eventually(() =>
    tabLabels().some((label) => label.startsWith("Pyxel"))
  );
  assert.ok(opened, `run panel opened (tabs: ${tabLabels().join(", ")})`);
}
