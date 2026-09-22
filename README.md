# Pyxel for VS Code

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kitao.pyxel-vscode?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/kitao.pyxel-vscode)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![CI](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml)

Run [Pyxel](https://github.com/kitao/pyxel) games inside VS Code with nothing
installed.

The extension embeds the Pyxel Web runtime in a Webview: run a `.py` file next
to your code, edit `.pyxres` resources in the Pyxel Editor, and play `.pyxapp`
files.

## Features

- **Run games** — `Pyxel: Run`, the editor run button, or right-click a `.py`
  file in the explorer. The game opens beside your code.
- **Auto-reload** — the running game reloads when you save a project file,
  including resources saved in the Pyxel Editor.
- **Edit resources** — `.pyxres` files open in the Pyxel Editor;
  `Pyxel: New Resource` creates one.
- **Play apps** — `.pyxapp` files open in the Pyxel Player.
- **Copy examples** — `Pyxel: Copy Examples` downloads the official examples
  for the bundled Pyxel version into a `pyxel_examples` folder, excluding the
  native-only `99_flip_animation.py` example.
- **Browse docs** — `Pyxel: API Reference` and `Pyxel: Editor Manual`.
- **Capture** — screenshots and screencasts taken in the game are saved next
  to the file you opened. Existing captures are kept; repeated names receive a
  numbered suffix.

## Getting started

1. Run `Pyxel: Copy Examples` from the command palette and pick a folder.
2. Open `pyxel_examples/01_hello_pyxel.py`.
3. Press the run button, or run `Pyxel: Run`. The game opens in a panel.
4. Edit the code and save; the game reloads.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pyxel.autoReload` | `true` | Reload the running game when a file in the project folder is saved. |

## Requirements and limitations

- VS Code 1.85 or newer.
- The Pyxel Web runtime (Pyxel 2.9.9) is loaded from jsDelivr, so an internet
  connection is required to launch games. If loading fails or stalls, use
  **Retry** in the panel after checking your connection.
- Project files are bundled into the runtime with these limits: 5 MB per file,
  20 MB in total, 3 directory levels deep. Skipped files are listed in the
  Pyxel output channel.
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
