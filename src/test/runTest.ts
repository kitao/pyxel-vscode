import * as path from "path";
import { runTests } from "@vscode/test-electron";

// Launch the oldest supported VS Code with only this extension and run suite.ts.
async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "..", "..");
  const extensionTestsPath = path.resolve(__dirname, "suite");
  const version = process.env.VSCODE_VERSION ?? "1.85.0";
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    version,
    launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
