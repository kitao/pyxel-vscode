import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

type PackageJson = {
  scripts?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  const packagePath = path.join(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJson;
}

describe("package scripts", () => {
  it("compiles before publishing or packaging the VS Code extension", () => {
    const scripts = readPackageJson().scripts ?? {};
    expect(scripts["vscode:prepublish"]).toBe("npm run compile");
    expect(scripts.package).toBe("vsce package");
  });
});
