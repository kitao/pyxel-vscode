# Pyxel for VS Code

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kitao.pyxel-vscode?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/kitao.pyxel-vscode)](https://marketplace.visualstudio.com/items?itemName=kitao.pyxel-vscode)
[![CI](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/kitao/pyxel-vscode/actions/workflows/ci.yml)

Run [Pyxel](https://github.com/kitao/pyxel) games inside VS Code with nothing
installed, and hand your AI agent the tools and the skill to build them.

The extension embeds the Pyxel Web runtime in a Webview: run a `.py` file next
to your code, edit `.pyxres` resources in the Pyxel Editor, and play `.pyxapp`
files. It also contributes the [pyxel skill](https://github.com/kitao/pyxel-skill)
to agent mode and, when [uv](https://docs.astral.sh/uv/) is installed, offers
the [pyxel-mcp](https://github.com/kitao/pyxel-mcp) server, so an agent can
build a game, run it headlessly, look at the frames, and fix it.

## For you

- **Run games** — `Pyxel: Run`, the editor run button, or right-click a `.py`
  file in the explorer. The game opens beside your code.
- **Auto-reload** — the running game reloads when you save a project file,
  including resources saved in the Pyxel Editor.
- **Edit resources** — `.pyxres` files open in the Pyxel Editor;
  `Pyxel: New Resource` creates one.
- **Play apps** — `.pyxapp` files open in the Pyxel Player.
- **Copy examples** — `Pyxel: Copy Examples` downloads the official examples
  for the bundled Pyxel version into a `pyxel_examples` folder.
- **Browse docs** — `Pyxel: API Reference` and `Pyxel: Editor Manual`.
- **Capture** — screenshots and screencasts taken in the game are saved next
  to the file you opened.

## For your AI agent

- **MCP server** — with uv installed, a `Pyxel` server running pyxel-mcp 1.3.0
  through `uvx` appears in VS Code agent mode with no configuration. Its eight
  tools run a script headlessly with scheduled input, stop on a condition such
  as `score >= 1`, return screenshots as images, and inspect palettes, image
  banks, tilemaps, and audio. Turn it off with `pyxel.mcp.enabled`.
- **Agent Skill** — the bundled `pyxel` skill tells agents how to scope a
  game, which evidence to collect, and what to report. Skills from extensions
  appear in the Configure Skills menu next to your own. The skill's fallback
  hint to run `uvx pyxel-mcp install` is for other clients; in VS Code the
  extension already offers the server.
- **Try it** — ask agent mode: "Build a small Pyxel shooter and verify that
  the player can score." The agent writes the game, runs it through pyxel-mcp,
  and iterates on real frames.

Everything else works without uv; only the MCP server needs it.

## Getting started

Open **Help › Welcome** and pick **Get Started with Pyxel** under Walkthroughs
for a guided tour, or:

1. Run `Pyxel: Copy Examples` from the command palette and pick a folder.
2. Open `pyxel_examples/01_hello_pyxel.py`.
3. Press the run button, or run `Pyxel: Run`. The game opens in a panel.
4. Edit the code and save; the game reloads.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pyxel.autoReload` | `true` | Reload the running game when a file in the project folder is saved. |
| `pyxel.mcp.enabled` | `true` | Offer the Pyxel MCP server (pyxel-mcp run through `uvx`) to AI agents in VS Code. Requires uv. |

## Requirements and limitations

- VS Code 1.109 or newer. Editors built on an older VS Code, or without its
  MCP and skill APIs, cannot install this version.
- The Pyxel Web runtime (Pyxel 2.9.9) is loaded from jsDelivr, so an internet
  connection is required to launch games.
- Project files are bundled into the runtime with these limits: 5 MB per file,
  20 MB in total, 3 directory levels deep. Skipped files are listed in the
  Pyxel output channel.
- The extension is disabled in Restricted Mode because running a script
  executes workspace code.
- The extension is not yet on Open VSX. Editors that install from there can
  use the `.vsix` attached to each
  [GitHub release](https://github.com/kitao/pyxel-vscode/releases).

## Related projects

- [Pyxel](https://github.com/kitao/pyxel) — the retro game engine for Python.
- [pyxel-mcp](https://github.com/kitao/pyxel-mcp) — the MCP server this
  extension offers to agents.
- [pyxel-skill](https://github.com/kitao/pyxel-skill) — the Agent Skill this
  extension bundles, also installable with `npx skills add kitao/pyxel-skill`.

## Development

```bash
npm install          # install dependencies
npm run compile      # build to dist/
npm run watch        # rebuild on change
npm test                    # unit tests (vitest)
npm run test:integration    # start the extension in VS Code 1.109.0
npm run lint                # ESLint
npm run typecheck           # type-check sources and tests
npm run package             # build the .vsix
npm run sync-skill -- 1.4.0 # vendor a pyxel-skill release into skills/pyxel/
```

Press `F5` in VS Code to launch an Extension Development Host. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the release process.

## License

[MIT](LICENSE)
