import { describe, it, expect } from "vitest";
import {
  EXAMPLES_PREFIX,
  getExamplesTreeUrl,
  isRedirectStatus,
  resolveRedirectUrl,
  selectExampleFiles,
} from "../copyExamples";
import { PYXEL_VERSION } from "../utils";

describe("copyExamples helpers", () => {
  it("uses the pinned Pyxel version for the GitHub tree URL", () => {
    expect(getExamplesTreeUrl()).toBe(
      `https://api.github.com/repos/kitao/pyxel/git/trees/v${PYXEL_VERSION}?recursive=1`
    );
  });

  it("recognizes permanent, temporary, and method-preserving redirects", () => {
    expect(isRedirectStatus(301)).toBe(true);
    expect(isRedirectStatus(302)).toBe(true);
    expect(isRedirectStatus(303)).toBe(true);
    expect(isRedirectStatus(307)).toBe(true);
    expect(isRedirectStatus(308)).toBe(true);
    expect(isRedirectStatus(200)).toBe(false);
    expect(isRedirectStatus(undefined)).toBe(false);
  });

  it("resolves relative redirect locations against the current URL", () => {
    expect(resolveRedirectUrl(
      "https://cdn.jsdelivr.net/gh/kitao/pyxel@v2.9.6/python/file.py",
      "../other.py"
    )).toBe("https://cdn.jsdelivr.net/gh/kitao/pyxel@v2.9.6/other.py");
  });

  it("selects example blobs and skips pycache entries", () => {
    const result = selectExampleFiles({
      tree: [
        { type: "blob", path: `${EXAMPLES_PREFIX}01_hello.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}assets/player.pyxres` },
        { type: "blob", path: `${EXAMPLES_PREFIX}__pycache__/ignored.pyc` },
        { type: "tree", path: `${EXAMPLES_PREFIX}nested` },
        { type: "blob", path: "README.md" },
      ],
    });

    expect(result).toEqual([
      `${EXAMPLES_PREFIX}01_hello.py`,
      `${EXAMPLES_PREFIX}assets/player.pyxres`,
    ]);
  });

  it("rejects tree entries with unsafe path segments", () => {
    const result = selectExampleFiles({
      tree: [
        { type: "blob", path: `${EXAMPLES_PREFIX}../escape.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}a//double.py` },
        { type: "blob", path: `${EXAMPLES_PREFIX}ok.py` },
      ],
    });

    expect(result).toEqual([`${EXAMPLES_PREFIX}ok.py`]);
  });

  it("rejects malformed GitHub tree responses", () => {
    expect(() => selectExampleFiles({})).toThrow("Invalid GitHub tree response");
    expect(() => selectExampleFiles({ tree: "not an array" })).toThrow(
      "Invalid GitHub tree response"
    );
  });
});
