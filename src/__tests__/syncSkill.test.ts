import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { syncSkill } from "../../scripts/sync-skill.mjs";

const SKILL = [
  "---",
  "name: pyxel",
  "---",
  "Read [references/pyxel.md](references/pyxel.md) and",
  "[design](references/design.md); see [references/pyxel.md](references/pyxel.md) again.",
].join("\n");

const created: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-sync-"));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("syncSkill", () => {
  it("fetches SKILL.md and every reference it links, then writes them", async () => {
    const destination = path.join(tempDir(), "pyxel");
    const requested: string[] = [];
    const fetchText = async (url: string) => {
      requested.push(url);
      return url.endsWith("SKILL.md") ? SKILL : `content of ${url}`;
    };

    const files = await syncSkill({ version: "1.4.0", destination, fetchText });

    expect(files).toEqual(["SKILL.md", "references/pyxel.md", "references/design.md"]);
    expect(requested).toEqual(
      files.map((file) => `https://cdn.jsdelivr.net/gh/kitao/pyxel-skill@v1.4.0/${file}`)
    );
    expect(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8")).toBe(SKILL);
    expect(fs.readFileSync(path.join(destination, "references", "design.md"), "utf8")).toContain(
      "design.md"
    );
  });

  it("replaces the previous copy, dropping files the new release no longer has", async () => {
    const destination = path.join(tempDir(), "pyxel");
    fs.mkdirSync(path.join(destination, "references"), { recursive: true });
    fs.writeFileSync(path.join(destination, "references", "old.md"), "stale");
    const fetchText = async (url: string) => (url.endsWith("SKILL.md") ? SKILL : "fresh");

    await syncSkill({ version: "1.4.0", destination, fetchText });

    expect(fs.existsSync(path.join(destination, "references", "old.md"))).toBe(false);
    expect(fs.existsSync(path.join(destination, "references", "pyxel.md"))).toBe(true);
  });

  it("leaves the previous copy untouched when any download fails", async () => {
    const destination = path.join(tempDir(), "pyxel");
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, "SKILL.md"), "previous");
    const fetchText = async (url: string) => {
      if (url.endsWith("design.md")) throw new Error("HTTP 404 for design.md");
      return url.endsWith("SKILL.md") ? SKILL : "fresh";
    };

    await expect(syncSkill({ version: "1.4.0", destination, fetchText })).rejects.toThrow(
      "HTTP 404"
    );
    expect(fs.readFileSync(path.join(destination, "SKILL.md"), "utf8")).toBe("previous");
    expect(fs.existsSync(path.join(destination, "references"))).toBe(false);
  });
});
