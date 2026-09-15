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

function tabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs);
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
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  assert.equal(tabs().length, 0, "the explorer-run scenario starts without editors");
  const existingTabs = new Set(tabs());
  try {
    const script = path.join(directory, "game.py");
    fs.writeFileSync(script, "import pyxel\n");
    await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(script));
    const opened = await eventually(() => tabs().some((tab) =>
      !existingTabs.has(tab) && tab.input instanceof vscode.TabInputWebview
    ));
    assert.ok(opened, "run panel opened");
    const runTab = tabs().find((tab) => !existingTabs.has(tab));
    assert.ok(runTab && !runTab.isPreview, "the game opens as a persistent tab");
    await vscode.window.showTextDocument(vscode.Uri.file(script), { preview: true });
    assert.ok(await eventually(() => tabs().some((tab) =>
      tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === script
    )), "the game source opens");
    assert.ok(tabs().includes(runTab), "opening code preserves the running game panel");

    const second = path.join(directory, "second.py");
    fs.writeFileSync(second, "import pyxel\n");
    await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(second));
    assert.ok(await eventually(() => runTab?.label === "Pyxel — second.py"),
      "the existing run panel switches to the next script");
    assert.equal(tabs().filter((tab) => tab.input instanceof vscode.TabInputWebview).length, 1,
      "running again does not open another panel");

    // New Resource opens a path before it exists on disk.
    const resource = vscode.Uri.file(path.join(directory, "new.PYXRES"));
    await vscode.commands.executeCommand("vscode.openWith", resource, "pyxel.editor");
    assert.ok(await eventually(() => tabs().some((tab) =>
      tab.input instanceof vscode.TabInputCustom &&
      tab.input.viewType === "pyxel.editor" &&
      tab.input.uri.toString() === resource.toString()
    )), "a new resource opens in the custom editor");
  } finally {
    await vscode.window.tabGroups.close(tabs().filter((tab) => !existingTabs.has(tab)));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
