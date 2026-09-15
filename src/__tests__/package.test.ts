import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");

type PackageJson = {
  activationEvents: string[];
  devDependencies: Record<string, string>;
  engines: { vscode: string };
  scripts: Record<string, string>;
  contributes: {
    commands: Array<{ command: string }>;
  };
};

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
) as PackageJson;

describe("package manifest", () => {
  it("compiles before publishing or packaging the VS Code extension", () => {
    expect(pkg.scripts["vscode:prepublish"]).toBe("npm run compile");
    expect(pkg.scripts.package).toBe("vsce package");
  });

  it("keeps the API types in step with the oldest supported VS Code", () => {
    expect(pkg.engines.vscode).toBe("^1.85.0");
    expect(pkg.devDependencies["@types/vscode"]).toBe("~1.85.0");
  });

  it("lets VS Code derive activation from the contributions", () => {
    expect(pkg.activationEvents).toEqual([]);
  });
});
