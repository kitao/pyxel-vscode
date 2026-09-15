import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

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

  const manifest = extension.packageJSON as {
    contributes: { commands: Array<{ command: string }> };
  };
  const commands = new Set(await vscode.commands.getCommands(true));
  for (const { command } of manifest.contributes.commands) {
    assert.ok(commands.has(command), `${command} is registered`);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-smoke-"));
  const script = path.join(directory, "game.py");
  fs.writeFileSync(script, "import pyxel\n");
  await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(script));
  const opened = await eventually(() =>
    tabLabels().some((label) => label.startsWith("Pyxel"))
  );
  assert.ok(opened, `run panel opened (tabs: ${tabLabels().join(", ")})`);
}
