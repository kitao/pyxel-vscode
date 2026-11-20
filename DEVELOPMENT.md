# Development

## Scope

This extension embeds Pyxel's existing Web runtime and editor in VS Code.
Keep it lightweight: prefer small integration fixes and leave editor behavior
and resource management to Pyxel.

## Setup

```bash
git clone https://github.com/kitao/pyxel-vscode.git
cd pyxel-vscode
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded.

The extension host and Webview use separate TypeScript configurations.
`npm run compile` builds both and prepares their runtime assets. Once
`npm ci` has completed, compilation and packaging work offline.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run package
```

All four must pass before committing, and CI runs the same ones. Add or
update tests in `src/__tests__` for the modules you change.

CI runs the packaged VSIX in the minimum supported VS Code and the current
stable release, using a temporary directory outside the checkout. It starts a game with external DNS blocked, checks a
rendered PNG, saves the script to trigger a reload, and opens a resource in
the custom editor. Run `npm run test:integration` after changing these paths.

## Updating Pyxel

`vendor/pyxel` contains the official Pyxel 3.0.3 Web distribution from
[tag v3.0.3](https://github.com/kitao/pyxel/tree/v3.0.3/wasm). To upgrade,
replace the loader, style sheet, import hook, wheel, images, and license with
the files from the same release. Pin the matching `pyodide` npm version and
refresh the notices under `vendor/pyodide` from Pyxel's Pyodide distribution.

`scripts/build-runtime.mjs` checks that the loader matches both packages and
points its bootstrap URL at the bundled Pyodide files. **Copy Examples**
extracts the official examples directly from the installed wheel on demand,
omitting the native-only flip example. Verify a 2D game, a Cube example, and a resource save
from the packaged VSIX when updating the runtime.

## Releasing

1. Bump `version` in `package.json` (`npm install --package-lock-only` syncs
   the lockfile) and add a `## x.y.z` section to `CHANGELOG.md`.
2. Run the checks above, then commit.
3. Tag `vX.Y.Z` and push the tag.
4. The release workflow verifies that the tag matches `package.json` and that
   the changelog has a section for it, runs the checks, builds the `.vsix`,
   and creates a GitHub Release with it and that section as notes.
5. Download the `.vsix` from the release, list its contents with `unzip -Z1`,
   and upload that same file to the
   [Marketplace publisher page](https://marketplace.visualstudio.com/manage/publishers/kitao).
6. Wait until `npx vsce show kitao.pyxel-vscode` reports the new version.

Publishing is a manual upload, so the release and the Marketplace are a few
minutes apart. Uploading the file the workflow built keeps the `.vsix` on the
release and the one users install byte for byte the same.
