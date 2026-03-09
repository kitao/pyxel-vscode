# Pyxel VS Code Extension

VS Code extension for Pyxel — run scripts, edit resources, and play apps via embedded WASM runtime.

## Structure

```
src/extension.ts         Extension entry point (single file)
dist/                    Compiled JavaScript output
media/icon.png           Extension icon
```

## Build

```
npm run compile          # TypeScript → JavaScript
npm run watch            # watch mode for development
npx vsce package         # create .vsix for distribution
```

## Coding Conventions

- Follow TypeScript idioms — natural, concise code
- Comments in concise English
- Use blank lines between logical sections, not after every line
- `camelCase` for variables/functions, `UPPER_CASE` for module constants
- 2-space indentation

## Release

Always confirm the version number before releasing.
Versioning: semver (new features = minor, bug fixes = patch).

1. Update version in `package.json`
2. `npm run compile`
3. `npx vsce package`
4. Commit, tag (`v0.x.x`), and push
5. Upload `.vsix` at https://marketplace.visualstudio.com/manage (Pyxel extension → "…" → "Update")

Publisher: `kitao` (direct upload, no Azure DevOps PAT).

## CHANGELOG

Maintained in `CHANGELOG.md` at the repo root.

- `## x.y.z` header with `- ` bullet points
- Concise English, one item per line, start with a verb (Added, Fixed, Removed, etc.)
- Flat list only — no nested sub-items
- Under 60 characters; 80 max for complex entries
- Newest entries last within each section
