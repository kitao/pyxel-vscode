# Pyxel - VS Code Extension

Run [Pyxel](https://github.com/kitao/pyxel) games directly in VS Code — no installation required.

This extension uses the Pyxel WASM build to run games, edit resources, and play apps entirely within VS Code's WebView panel.

## Features

- **Run** `.py` scripts with the toolbar button or `Pyxel: Run` command
- **Edit** `.pyxres` resource files by clicking them in the file explorer
- **Play** `.pyxapp` application files by clicking them in the file explorer
- **Create** new resource files with the `Pyxel: New Resource` command
- Auto-reload on file save during game development

## Usage

1. Open a folder containing Pyxel project files
2. Click a `.py` file and press the Pyxel cube icon in the editor toolbar
3. The game runs in a side panel — edit your code and save to auto-reload

For `.pyxres` and `.pyxapp` files, simply click them in the file explorer to open.

## Supported File Types

| Extension | Action |
|-----------|--------|
| `.py` | Run as Pyxel game script |
| `.pyxres` | Open in Pyxel resource editor |
| `.pyxapp` | Play as Pyxel application |

## Requirements

No local Pyxel installation is needed. The extension loads Pyxel via CDN on first use.

## License

[MIT](LICENSE)
