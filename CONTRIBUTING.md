# Contributing

Thanks for your interest in improving the Pyxel VS Code extension!

## Reporting issues

Open an issue at <https://github.com/kitao/pyxel-vscode/issues> with:

- What you did, what you expected, and what happened
- VS Code version and OS
- Errors from the Pyxel output channel, if any

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
```

All three must pass (CI runs the same checks). Keep changes focused, follow
the existing code style, and add or update unit tests for pure logic in
`src/utils.ts`, `src/messages.ts`, and `src/copyExamples.ts`.

Note that the Pyxel runtime version is pinned in `src/utils.ts`
(`PYXEL_VERSION`); runtime upgrades are handled by the maintainer.
