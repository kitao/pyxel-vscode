import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const EXTENSION_ID = "kitao.pyxel-vscode";

// Tabs appear a tick after the command that creates them resolves.
async function eventually(check: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check()) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return await check();
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
  let tabListener: vscode.Disposable | undefined;
  try {
    const script = path.join(directory, "game.py");
    fs.writeFileSync(script, [
      "import pyxel",
      "pyxel.init(32, 24)",
      "pyxel.cls(8)",
      "pyxel.screenshot('first.png', 1)",
    ].join("\n"));
    await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(script));
    const opened = await eventually(() => tabs().some((tab) =>
      tab.input instanceof vscode.TabInputWebview
    ));
    assert.ok(opened, "run panel opened");
    const runTab = tabs().find((tab) => tab.input instanceof vscode.TabInputWebview);
    assert.ok(runTab && !runTab.isPreview, "the game opens as a persistent tab");
    const viewType = (runTab.input as vscode.TabInputWebview).viewType;
    const isRunTab = (tab: vscode.Tab) =>
      tab.input instanceof vscode.TabInputWebview && tab.input.viewType === viewType;
    // Group updates can replace Tab API objects without closing the panel.
    const currentRunTabs = () => tabs().filter(isRunTab);
    let runPanelClosed = false;
    tabListener = vscode.window.tabGroups.onDidChangeTabs((event) => {
      if (event.closed.some(isRunTab)) runPanelClosed = true;
    });
    const capture = path.join(directory, "first.png");
    assert.ok(await eventually(() => fs.existsSync(capture), 60000),
      "the bundled runtime renders and saves a PNG offline");
    const png = fs.readFileSync(capture);
    assert.equal(png.readUInt32BE(16), 32);
    assert.equal(png.readUInt32BE(20), 24);

    const editor = await vscode.window.showTextDocument(vscode.Uri.file(script), { preview: true });
    assert.ok(await eventually(() => tabs().some((tab) =>
      tab.input instanceof vscode.TabInputText && tab.input.uri.fsPath === script
    )), "the game source opens");
    assert.equal(currentRunTabs().length, 1,
      "opening code preserves the running game panel");
    assert.ok(!runPanelClosed, "opening code does not close the running game panel");

    await editor.edit((edit) => edit.insert(editor.document.lineAt(3).range.end,
      "\npyxel.screenshot('reloaded.png', 1)"));
    await editor.document.save();
    assert.ok(!editor.document.isDirty, "the edited script is saved");
    assert.ok(await eventually(() => fs.existsSync(path.join(directory, "reloaded.png")), 15000),
      "saving the active script reruns it in the same panel");

    const second = path.join(directory, "second.py");
    fs.writeFileSync(second, "import pyxel\n");
    await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(second));
    assert.ok(await eventually(() => currentRunTabs().some((tab) =>
      tab.label === "Pyxel — second.py"
    )),
      "the existing run panel switches to the next script");
    assert.equal(tabs().filter((tab) => tab.input instanceof vscode.TabInputWebview).length, 1,
      "running again does not open another panel");
    assert.ok(!runPanelClosed, "running again reuses the existing game panel");

    const cube = path.join(directory, "cube.py");
    fs.writeFileSync(cube, [
      "import pyxel",
      "from pyxel.cube import Camera, Mat4, Node, Shading, Vec3",
      "class Scene(Node):",
      "    def __init__(self):",
      "        super().__init__()",
      "        self.shading = Shading(pyxel.colors)",
      "        self.camera = Camera()",
      "        self.camera.transform = Mat4.look_at(Vec3(0, 20, 35), Vec3.ZERO)",
      "    def on_draw(self):",
      "        self.box(Mat4.IDENTITY, Vec3(15, 15, 15), 8)",
      "pyxel.init(64, 64)",
      "Scene().draw(0, 0, 64, 64)",
      "pyxel.screenshot('cube.png', 1)",
    ].join("\n"));
    await vscode.commands.executeCommand("pyxel.run", vscode.Uri.file(cube));
    const cubeCapture = path.join(directory, "cube.png");
    assert.ok(await eventually(() => fs.existsSync(cubeCapture), 60000),
      "the bundled Cube runtime renders and saves a PNG offline");
    const cubePng = fs.readFileSync(cubeCapture);
    assert.equal(cubePng.readUInt32BE(16), 64);
    assert.equal(cubePng.readUInt32BE(20), 64);

    // New Resource opens a path before it exists on disk.
    const resource = vscode.Uri.file(path.join(directory, "new.PYXRES"));
    await vscode.commands.executeCommand("vscode.openWith", resource, "pyxel.editor");
    assert.ok(await eventually(() => tabs().some((tab) =>
      tab.input instanceof vscode.TabInputCustom &&
      tab.input.viewType === "pyxel.editor" &&
      tab.input.uri.toString() === resource.toString()
    )), "a new resource opens in the custom editor");
    const resourceSaved = await eventually(async () => {
      if (fs.existsSync(resource.fsPath)) return true;
      await vscode.commands.executeCommand("pyxel.forwardKey", {
        code: "KeyS", key: "s", shift: false,
      });
      return fs.existsSync(resource.fsPath);
    }, 60000);
    assert.ok(resourceSaved, "the bundled resource editor saves a new resource");
    assert.ok(fs.statSync(resource.fsPath).size > 0,
      "the saved resource is not empty");
  } finally {
    tabListener?.dispose();
    await vscode.window.tabGroups.close(tabs());
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
