import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { collectFiles } from "../utils";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string) {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe("collectFiles", () => {
  it("collects files and returns base64 content", () => {
    writeFile("hello.py", "print('hello')");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["hello.py"]);
    expect(Buffer.from(result["hello.py"], "base64").toString()).toBe(
      "print('hello')"
    );
  });

  it("collects files in subdirectories", () => {
    writeFile("sub/a.py", "a");
    writeFile("sub/b.txt", "b");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result).sort()).toEqual(["sub/a.py", "sub/b.txt"]);
  });

  it("skips .git directory", () => {
    writeFile(".git/config", "secret");
    writeFile("main.py", "ok");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["main.py"]);
  });

  it("skips __pycache__ directory", () => {
    writeFile("__pycache__/mod.pyc", "bytecode");
    writeFile("app.py", "ok");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["app.py"]);
  });

  it("skips node_modules directory", () => {
    writeFile("node_modules/pkg/index.js", "code");
    writeFile("app.py", "ok");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["app.py"]);
  });

  it("skips dotfiles and dot directories", () => {
    writeFile(".hidden", "secret");
    writeFile(".config/settings", "data");
    writeFile("visible.py", "ok");
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["visible.py"]);
  });

  it("respects MAX_DEPTH (3 levels)", () => {
    writeFile("a/b/c/deep.py", "ok");       // depth 3 — included
    writeFile("a/b/c/d/too_deep.py", "no");  // depth 4 — excluded
    const result = collectFiles(tmpDir);
    expect(result).toHaveProperty("a/b/c/deep.py");
    expect(result).not.toHaveProperty("a/b/c/d/too_deep.py");
  });

  it("skips files larger than MAX_FILE_SIZE", () => {
    // Create a file just over 5MB
    const bigContent = "x".repeat(5 * 1024 * 1024 + 1);
    writeFile("big.bin", bigContent);
    writeFile("small.py", "ok");
    const result = collectFiles(tmpDir);
    expect(result).not.toHaveProperty("big.bin");
    expect(result).toHaveProperty("small.py");
  });

  it("stops when total size exceeds MAX_TOTAL_SIZE", () => {
    // Create many 1MB files to exceed 20MB total
    for (let i = 0; i < 25; i++) {
      writeFile(`file${String(i).padStart(2, "0")}.bin`, "x".repeat(1024 * 1024));
    }
    const result = collectFiles(tmpDir);
    const totalSize = Object.values(result).reduce(
      (sum, b64) => sum + Buffer.from(b64, "base64").length, 0
    );
    expect(totalSize).toBeLessThanOrEqual(20 * 1024 * 1024);
  });

  it("returns empty object for empty directory", () => {
    const result = collectFiles(tmpDir);
    expect(result).toEqual({});
  });

  it("skips symbolic links", () => {
    writeFile("real.py", "content");
    fs.symlinkSync(
      path.join(tmpDir, "real.py"),
      path.join(tmpDir, "link.py")
    );
    const result = collectFiles(tmpDir);
    expect(Object.keys(result)).toEqual(["real.py"]);
  });

  it("uses forward slashes in relative paths", () => {
    writeFile("sub/dir/file.py", "ok");
    const result = collectFiles(tmpDir);
    const keys = Object.keys(result);
    expect(keys[0]).toBe("sub/dir/file.py");
    expect(keys[0]).not.toContain("\\");
  });
});
