# Pyxel for VS Code

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kitao.pyxel-vscode?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/kitao.pyxel-vscode)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![CI](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml)

VS Code extension for [Pyxel](https://github.com/kitao/pyxel), a retro game engine for Python.

Run games, edit resources, and play apps directly in VS Code — no local Pyxel
installation required. Everything runs on the Pyxel Web runtime inside VS Code.

## Features

- **Run games** — `Pyxel: Run` command, the editor run button, or right-click a
  `.py` file in the explorer
- **Auto-reload** — the running game reloads when you save a project file
  (including resource files saved in the Pyxel Editor)
- **Edit resources** — open `.pyxres` files in the Pyxel Editor
- **Play apps** — open `.pyxapp` files in the Pyxel Player
- **Create resources** — `Pyxel: New Resource`
- **Copy examples** — `Pyxel: Copy Examples` downloads the official examples
  to a `pyxel_examples` folder
- **Browse docs** — `Pyxel: API Reference` and `Pyxel: Editor Manual` open in
  VS Code
- **Capture** — Pyxel screenshots and screencasts are saved next to the game

## Getting Started

1. Run `Pyxel: Copy Examples` from the command palette and pick a folder.
2. Open `pyxel_examples/01_hello_pyxel.py`.
3. Press the run button (or run `Pyxel: Run`) — the game opens in a panel.
4. Edit the code and save; the game reloads automatically.

## Extension Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pyxel.autoReload` | `true` | Reload the running game when a file in the project folder is saved. |

## Requirements and Limitations

- The Pyxel Web runtime (pinned to Pyxel 2.9.8) is loaded from jsDelivr, so an
  internet connection is required to launch games.
- Project files are bundled into the runtime with these limits: 5 MB per file,
  20 MB in total, 3 directory levels deep. Files skipped by these limits are
  listed in the Pyxel output channel.
- The extension is disabled in Restricted Mode because running a script
  executes workspace code.

## Development

```bash
npm install        # install dependencies
npm run compile    # build to dist/
npm run watch      # rebuild on change
npm test           # run unit tests (vitest)
npm run lint       # run ESLint
npm run typecheck  # type-check sources and tests
npm run package    # build the .vsix
```

Press `F5` in VS Code to launch an Extension Development Host.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

## License

[MIT](LICENSE)
