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
`.vscode-test/` and checks that the extension activates and registers its
commands in a real editor. Run it yourself when you change activation,
`contributes`, or `src/test`.

## Pinned upstream version

`PYXEL_VERSION` in `src/utils.ts` pins the Pyxel Web runtime loaded from
jsDelivr and the examples downloaded by `Pyxel: Copy Examples`.

Runtime upgrades are verified by launching the Webview against the new
runtime, not only by unit tests.

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
manual upload, so it happens before the tag and the GitHub Release never
points at a version that is not installable.
