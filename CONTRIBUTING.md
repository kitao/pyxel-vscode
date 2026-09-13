# Contributing

Thanks for your interest in improving the Pyxel VS Code extension!

## Reporting issues

Use the bug report form at <https://github.com/kitao/pyxel-vscode/issues>.
It asks for the extension and VS Code versions, your OS, the steps you took,
and the relevant lines from the Pyxel output channel.

## Development setup

```bash
git clone https://github.com/kitao/pyxel-vscode.git
cd pyxel-vscode
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded.

## Before submitting a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run package
```

All four must pass (CI runs the same checks). Keep changes focused, follow
the existing code style, and add or update tests in `src/__tests__` for the
modules you change.

CI also runs `npm run test:integration`, which downloads VS Code 1.109.0 into
`.vscode-test/` and checks that the extension activates and registers its
commands, custom editors, and MCP provider there. Run it yourself when you
change activation, `contributes`, or `src/test`.

## Pinned upstream versions

The extension fetches or bundles three upstream projects:

- `PYXEL_VERSION` in `src/utils.ts`: the Pyxel Web runtime loaded from
  jsDelivr and the examples downloaded by `Pyxel: Copy Examples`.
- `PYXEL_MCP_VERSION` in `src/utils.ts`: the exact `pyxel-mcp` release that
  `uvx` runs for the MCP server offered to AI agents. An exact pin keeps the
  server from changing underneath users, since uvx caches whatever satisfied
  a requirement first.
- `skills/pyxel/`: a [pyxel-skill](https://github.com/kitao/pyxel-skill)
  release vendored by `npm run sync-skill -- <version>`, which fetches
  `SKILL.md` and every reference it links from the release tag. The version
  is recorded in the skill's own frontmatter.

Runtime upgrades are handled by the maintainer and verified by launching the
Webview against the new runtime, not only by unit tests.

## Releasing

1. Bump `version` in `package.json` (`npm install --package-lock-only` syncs
   the lockfile) and add a `## x.y.z` section to `CHANGELOG.md`.
2. Run the checks above, then `rm -f *.vsix && npm run package`.
3. Upload the `.vsix` to the
   [Marketplace publisher page](https://marketplace.visualstudio.com/manage/publishers/kitao)
   and wait until `npx vsce show kitao.pyxel-vscode` reports the new version.
4. Commit, tag `vX.Y.Z`, and push the tag.

The release workflow verifies that the tag matches `package.json` and that the
changelog has a section for it, runs the checks, and creates a GitHub Release
with the `.vsix` and that section as notes. Publishing to the Marketplace is a
manual upload today, so it happens before the tag and the GitHub Release never
points at a version that is not installable.

The workflow can publish for you instead: set the `VSCE_PAT` secret for the
Marketplace, and for Open VSX create the namespace once with
`npx ovsx create-namespace kitao` and set `OVSX_PAT`. Both steps skip a
version that is already published.
