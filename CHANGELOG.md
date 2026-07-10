## 0.8.0

- Simplify the file-saved notification message
- Validate file names received from the webview before saving
- Confirm before replacing an existing pyxel_examples folder
- Download examples to a temp folder and swap in atomically
- Add timeout and cancel support to example downloads
- Debounce auto-reload so Save All reloads the game once
- Add pyxel.autoReload setting to toggle reload on save
- Save unsaved project files before running a script
- Reload the running game when a resource is saved in the editor
- Report files skipped by size or depth limits in the output channel
- Show a clear message when the Pyxel runtime fails to load
- Remove files deleted from the project from the runtime on reload
- Show the script name in the run panel title
- Forward Cmd+Shift+Z as redo to the Pyxel Editor
- Show the output panel once per run instead of on every error
- Type the webview message protocol with runtime validation
- Declare Restricted Mode and virtual workspace support levels
- Add marketplace metadata and sponsor link
- Add GitHub Actions CI and tag-driven release workflow
- Add ESLint and type checking for tests
- Exclude source maps and dev config from the packaged VSIX
- Expand README and add contributing guide
- Skip example tree entries containing unsafe path segments
- Run lint and tests before creating a GitHub release

## 0.7.0

- Pin the Pyxel Web runtime to Pyxel 2.9.6 instead of tracking the main branch
- Route Pyxel Editor save-button output through VS Code to avoid browser save dialogs
- Save Pyxel screenshots and screencasts next to the game and notify with the saved path
- Recover cleanly from Pyxel Web launch failures without leaving the panel stuck
- Split Webview HTML and Copy Examples logic into focused modules
- Harden Copy Examples redirect handling and GitHub tree parsing
- Compile fresh dist files before packaging the VSIX
- Clear run-panel state on disposal and tighten command/message typing

## 0.6.7

- Extract pure logic into utils.ts and add unit tests with vitest
- Add redirect limit to httpsGet
- Limit auto-reload to project directory files
- Add error handling to play mode file loading

## 0.6.6

- Use cryptographic nonce for webview security
- Escape filenames in embedded Python to prevent injection
- Add HTTP error handling for Copy Examples command
- Deduplicate iframe panel creation code

## 0.6.5

- Use latest Pyxel WASM runtime from main branch

## 0.6.4

- Update Pyxel WASM runtime to v2.8.6

## 0.6.3

- Update Pyxel WASM runtime to v2.8.5

## 0.6.2

- Update Pyxel WASM runtime to v2.8.4
- Update API Reference and Editor Manual URLs

## 0.6.1

- Update Pyxel WASM runtime to v2.8.3
- Add Editor Manual command to open Pyxel Editor docs

## 0.6.0

- Add API Reference command to open Pyxel API docs
- Show Pyxel app title in the panel tab
- Open New Resource in the active tab group
- Add Pyxel: Run to explorer context menu for .py files
- Fix run panel splitting again when re-running

## 0.5.1

- Pin Pyxel WASM runtime to v2.8.2

## 0.5.0

- Open .pyxres/.pyxapp files in-place instead of splitting the view

## 0.4.1

- Add error output to Pyxel output channel

## 0.4.0

- Add keyboard shortcut forwarding for Pyxel Editor (copy, paste, undo, redo, etc.)

## 0.3.0

- Update README
- Remove custom toolbar icon in favor of standard run button
- Add auto-dismiss for click-to-play overlay
- Add Pyxel: Run to editor run button dropdown

## 0.2.3

- Fix .pyxpal file not loaded in resource editor

## 0.2.2

- Reuse Pyxel panel for faster reloads
- Fix double launch and resolution issues on mode switching

## 0.2.1

- Optimize example downloads to run in parallel
- Fix Copy Examples to create pyxel_examples subdirectory

## 0.2.0

- Update README
- Add Copy Examples command

## 0.1.0

- Initial release
