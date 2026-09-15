import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..", "..");

type Step = {
  description: string;
  media: { markdown: string };
  completionEvents?: string[];
};

type PackageJson = {
  activationEvents: string[];
  devDependencies: Record<string, string>;
  engines: { vscode: string };
  scripts: Record<string, string>;
  contributes: {
    commands: Array<{ command: string }>;
    walkthroughs: Array<{ steps: Step[] }>;
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

  it("ships walkthrough media and links only to contributed commands", () => {
    const commands = new Set(pkg.contributes.commands.map((entry) => entry.command));
    for (const walkthrough of pkg.contributes.walkthroughs) {
      for (const step of walkthrough.steps) {
        expect(fs.existsSync(path.join(ROOT, step.media.markdown))).toBe(true);
        const linked = [...step.description.matchAll(/command:([\w.]+)/g)].map(
          (match) => match[1]
        );
        const completed = (step.completionEvents ?? [])
          .filter((event) => event.startsWith("onCommand:"))
          .map((event) => event.slice("onCommand:".length));
        for (const command of [...linked, ...completed]) {
          expect(commands.has(command)).toBe(true);
        }
      }
    }
  });

  it("keeps the walkthrough media inside the package", () => {
    const ignore = fs.readFileSync(path.join(ROOT, ".vscodeignore"), "utf8");
    expect(ignore).not.toMatch(/^media/m);
  });
});
