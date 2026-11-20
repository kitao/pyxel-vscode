import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { extractDirectory } from "../zip";

// Load only the VSIX contents so a missing dependency cannot resolve from the checkout.
async function main(): Promise<void> {
  const root = path.resolve(__dirname, "..", "..");
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    name: string; version: string;
  };
  const vsix = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
  const version = process.env.VSCODE_VERSION ?? "1.85.0";
  const temporary = await mkdtemp(path.join(os.tmpdir(), "pyxel-vsix-test-"));
  const extensionDevelopmentPath = path.join(temporary, "extension");
  try {
    await extractDirectory(vsix, "extension", extensionDevelopmentPath);
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, "suite"),
      version,
      launchArgs: [
        // GitHub's Linux runners have a virtual display but no hardware GPU.
        ...(process.platform === "linux" && process.env.GITHUB_ACTIONS === "true"
          ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
          : []),
        "--disable-extensions",
        "--disable-workspace-trust",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost",
        `--user-data-dir=${path.join(temporary, "profile")}`,
        `--extensions-dir=${path.join(temporary, "extensions")}`,
      ],
    });
  } finally {
    await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
