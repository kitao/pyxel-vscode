import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { collectFiles } from "../utils";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    lstatSync: vi.fn(actual.lstatSync),
    readFileSync: vi.fn(actual.readFileSync),
    readdirSync: vi.fn(actual.readdirSync),
  };
});

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyxel-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(relPath: string, content: string): void {
  const fullPath = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe("collectFiles", () => {
  it("collects files and returns base64 content", () => {
    writeFile("hello.py", "print('hello')");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["hello.py"]);
    expect(Buffer.from(files["hello.py"], "base64").toString()).toBe(
      "print('hello')"
    );
  });

  it("collects files in subdirectories", () => {
    writeFile("sub/a.py", "a");
    writeFile("sub/b.txt", "b");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files).sort()).toEqual(["sub/a.py", "sub/b.txt"]);
  });

  it("collects directory entries in deterministic order", () => {
    writeFile("a.py", "a");
    writeFile("z.py", "z");
    vi.mocked(fs.readdirSync).mockImplementationOnce(
      (() => ["z.py", "a.py"]) as unknown as typeof fs.readdirSync
    );

    const { files } = collectFiles(tmpDir);

    expect(Object.keys(files)).toEqual(["a.py", "z.py"]);
  });

  it("skips .git directory", () => {
    writeFile(".git/config", "secret");
    writeFile("main.py", "ok");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["main.py"]);
  });

  it("skips __pycache__ directory", () => {
    writeFile("__pycache__/mod.pyc", "bytecode");
    writeFile("app.py", "ok");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["app.py"]);
  });

  it("skips node_modules directory", () => {
    writeFile("node_modules/pkg/index.js", "code");
    writeFile("app.py", "ok");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["app.py"]);
  });

  it("skips dotfiles and dot directories", () => {
    writeFile(".hidden", "secret");
    writeFile(".config/settings", "data");
    writeFile("visible.py", "ok");
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["visible.py"]);
  });

  it("respects MAX_DEPTH (3 levels)", () => {
    writeFile("a/b/c/deep.py", "ok");
    writeFile("a/b/c/d/too_deep.py", "no");
    const { files } = collectFiles(tmpDir);
    expect(files).toHaveProperty("a/b/c/deep.py");
    expect(files).not.toHaveProperty("a/b/c/d/too_deep.py");
  });

  it("skips files larger than MAX_FILE_SIZE", () => {
    const bigContent = "x".repeat(5 * 1024 * 1024 + 1);
    writeFile("big.bin", bigContent);
    writeFile("small.py", "ok");
    const { files } = collectFiles(tmpDir);
    expect(files).not.toHaveProperty("big.bin");
    expect(files).toHaveProperty("small.py");
  });

  it("stops when total size exceeds MAX_TOTAL_SIZE", () => {
    for (let i = 0; i < 25; i++) {
      const fileName = `file${String(i).padStart(2, "0")}.bin`;
      writeFile(fileName, "x".repeat(1024 * 1024));
    }
    const { files } = collectFiles(tmpDir);
    const totalSize = Object.values(files).reduce(
      (sum, b64) => sum + Buffer.from(b64, "base64").length, 0
    );
    expect(Object.keys(files)).toHaveLength(20);
    expect(totalSize).toBe(20 * 1024 * 1024);
  });

  it("returns empty object for empty directory", () => {
    const { files } = collectFiles(tmpDir);
    expect(files).toEqual({});
  });

  it("skips symbolic links", () => {
    writeFile("real.py", "content");
    fs.symlinkSync(
      path.join(tmpDir, "real.py"),
      path.join(tmpDir, "link.py")
    );
    const { files } = collectFiles(tmpDir);
    expect(Object.keys(files)).toEqual(["real.py"]);
  });

  it("uses forward slashes in relative paths", () => {
    writeFile("sub/dir/file.py", "ok");
    const { files } = collectFiles(tmpDir);
    const keys = Object.keys(files);
    expect(keys[0]).toBe("sub/dir/file.py");
    expect(keys[0]).not.toContain("\\");
  });

  it.skipIf(path.sep === "\\")(
    "preserves literal backslashes in POSIX file names",
    () => {
      writeFile("name\\part.py", "ok");

      const { files } = collectFiles(tmpDir);

      expect(Object.keys(files)).toEqual(["name\\part.py"]);
    }
  );

  it("reports files skipped for exceeding MAX_FILE_SIZE", () => {
    writeFile("big.bin", "x".repeat(5 * 1024 * 1024 + 1));
    writeFile("small.py", "ok");
    const { skipped } = collectFiles(tmpDir);
    expect(skipped).toEqual(["big.bin (exceeds 5 MB file limit)"]);
  });

  it("reports files that become unreadable during collection", () => {
    writeFile("blocked.py", "data");
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error("read failed");
    });

    const { files, skipped } = collectFiles(tmpDir);

    expect(files).toEqual({});
    expect(skipped).toEqual(["blocked.py (could not be read: read failed)"]);
  });

  it("reports directories that cannot be read", () => {
    vi.mocked(fs.readdirSync).mockImplementationOnce(() => {
      throw new Error("scan failed");
    });

    const { files, skipped } = collectFiles(tmpDir);

    expect(files).toEqual({});
    expect(skipped).toEqual(["./ (could not be read: scan failed)"]);
  });

  it("reports entries that cannot be inspected", () => {
    writeFile("vanished.py", "data");
    vi.mocked(fs.lstatSync).mockImplementationOnce(() => {
      throw new Error("stat failed");
    });

    const { files, skipped } = collectFiles(tmpDir);

    expect(files).toEqual({});
    expect(skipped).toEqual([
      "vanished.py (could not be inspected: stat failed)",
    ]);
  });

  it("reports directories skipped for exceeding MAX_DEPTH", () => {
    writeFile("a/b/c/d/too_deep.py", "no");
    const { skipped } = collectFiles(tmpDir);
    expect(skipped).toEqual(["a/b/c/d/ (exceeds depth limit of 3)"]);
  });

  it("reports truncation when total size exceeds MAX_TOTAL_SIZE", () => {
    for (let i = 0; i < 25; i++) {
      const fileName = `file${String(i).padStart(2, "0")}.bin`;
      writeFile(fileName, "x".repeat(1024 * 1024));
    }
    const { skipped } = collectFiles(tmpDir);
    expect(skipped).toEqual([
      "file20.bin and remaining files (exceeds 20 MB total limit)",
    ]);
  });

  it("does not report intentional skips (dotfiles, skip dirs)", () => {
    writeFile(".hidden", "secret");
    writeFile(".git/config", "x");
    writeFile("main.py", "ok");
    const { skipped } = collectFiles(tmpDir);
    expect(skipped).toEqual([]);
  });
});
