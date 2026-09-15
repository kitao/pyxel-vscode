import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");

const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const pkg = JSON.parse(read("package.json")) as {
  devDependencies: Record<string, string>;
  engines: { vscode: string };
};

// The minimum VS Code the extension claims to support, as "major.minor".
const supportedVersion = pkg.engines.vscode.match(/^\^(\d+\.\d+)\./)?.[1];

describe("oldest supported VS Code", () => {
  it("is declared as a range the marketplace understands", () => {
    expect(supportedVersion).toMatch(/^\d+\.\d+$/);
  });

  it("is the API version the sources are compiled against", () => {
    const types = pkg.devDependencies["@types/vscode"];

    expect(types).toMatch(/^~\d+\.\d+\./);
    expect(types.match(/^~(\d+\.\d+)\./)?.[1]).toBe(supportedVersion);
  });

  it("is the version the integration test runs the extension in", () => {
    const source = read("src/test/runTest.ts");

    expect(source).toMatch(/VSCODE_VERSION \?\? "\d+\.\d+\.\d+"/);
    expect(source.match(/VSCODE_VERSION \?\? "(\d+\.\d+)\./)?.[1])
      .toBe(supportedVersion);
  });
});
