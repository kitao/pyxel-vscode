# Pyxel for VS Code

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kitao.pyxel-vscode?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/kitao.pyxel-vscode)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![CI](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml)

Create and play [Pyxel](https://github.com/kitao/pyxel) games beside your
code. The extension includes Pyxel 3.0.4, its Python runtime, the resource
editor, and the official 2D and Cube examples. They work offline from the
first launch.

## Run your first game

1. Choose **Pyxel: Copy Examples** from the command palette and pick a folder.
2. Select **Open Hello Pyxel** to open the first example in your copy.
3. Use **Pyxel: Run** in the editor's run menu. The game opens beside the code.
4. Change the text in `draw()` and save. The running game shows your change.

To try 3D, run `pyxel_examples/cube/c01_hello_cube.py` the same way.
You can also run any local Pyxel script from its Explorer context menu.

## Working on a game

| Task | In VS Code |
| --- | --- |
| Run a script | Choose **Pyxel: Run** with a `.py` file open. Saving code or a resource in its project folder reloads the game. |
| Edit art, tilemaps, sound, or music | Open a `.pyxres` file or choose **Pyxel: New Resource**. Save in the Pyxel Editor with its save button, Ctrl+S, or Cmd+S. |
| Play a packaged game | Open a `.pyxapp` file. |
| Capture a frame or screencast | Use Pyxel's capture controls. Captures appear beside the file you opened. Repeated filenames receive a numbered suffix. |
| Look up an API or editor tool | **Pyxel: API Reference** and **Pyxel: Editor Manual** open the online documentation beside your code. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pyxel.autoReload` | `true` | Reload the running game when a file in the project folder is saved. |

## Requirements and limitations

- VS Code 1.85 or newer.
- The project starts in the script's folder. Each run includes up to 5 MiB
  per file and 20 MiB total, through three levels of subfolders. The entry
  script takes priority. **Output › Pyxel** lists files skipped by these limits.
- The extension is disabled in Restricted Mode because running a script
  executes workspace code.
- Save resource edits with the Pyxel Editor's save button or Ctrl+S / Cmd+S
  before closing the tab. Resource edits do not participate in VS Code's
  unsaved indicators, Save All, or recovery backups.
- The extension is not yet on Open VSX. Editors that install from there can
  use the `.vsix` attached to each
  [GitHub release](https://github.com/kitao/pyxel-vscode/releases).

## Reporting problems

Runtime errors and Python output are written to **View › Output › Pyxel**.
For copy or save failures, also include the error notification when you
[open an issue](https://github.com/kitao/pyxel-vscode/issues).

## Development

```bash
npm install              # install dependencies
npm run compile          # build to dist/
npm run watch            # rebuild the extension host on change
npm test                 # unit tests (vitest)
npm run test:integration # start the extension in VS Code
npm run lint             # ESLint
npm run typecheck        # type-check sources and tests
npm run package          # build the .vsix
```

Press `F5` in VS Code to launch an Extension Development Host. See
[DEVELOPMENT.md](DEVELOPMENT.md) for the release process.

## License

[MIT](LICENSE)
