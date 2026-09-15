# Development

## Setup

```bash
git clone https://github.com/kitao/pyxel-vscode.git
cd pyxel-vscode
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host with the
extension loaded.

The extension host and the Webview are compiled separately, since only the
Webview sees the DOM: `npm run compile` runs `tsc` for `src` and then for
`src/webview`, whose output is inlined into the Webview page at runtime. A
Webview change needs a recompile before it shows up.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run package
```

All four must pass before committing, and CI runs the same ones. Add or
update tests in `src/__tests__` for the modules you change.

CI also runs `npm run test:integration`, which downloads VS Code into
`.vscode-test/` and checks activation, command registration, run-panel reuse,
and opening a new resource in the real editor. Run it yourself when you
change activation, panels, custom editors, `contributes`, or `src/test`.

The integration smoke test does not wait for the CDN runtime. For Webview
changes, also launch a game with the pinned runtime, run another script while
it loads, and open and save a resource in Pyxel Editor.

## Pinned upstream version

`PYXEL_VERSION` in `src/utils.ts` pins the Pyxel Web runtime loaded from
jsDelivr and the examples downloaded by `Pyxel: Copy Examples`.

Runtime upgrades are verified by launching the Webview against the new
runtime, not only by unit tests.

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
