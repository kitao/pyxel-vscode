# Security

The extension runs workspace code inside a Webview that hosts the Pyxel Web
runtime loaded from jsDelivr. Messages from the Webview are validated before
the extension writes any file, and the extension is disabled in Restricted
Mode. `Pyxel: Copy Examples` downloads files from the Pyxel repository on
GitHub into the folder you choose, and the documentation commands show
kitao.github.io pages in a Webview.

To report a vulnerability, please use GitHub private vulnerability reporting
(https://github.com/kitao/pyxel-vscode/security/advisories/new) instead of a
public issue.
