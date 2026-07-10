import { describe, it, expect } from "vitest";
import { parseWebviewMessage } from "../messages";

describe("parseWebviewMessage", () => {
  it("parses a ready message", () => {
    expect(parseWebviewMessage({ command: "ready" })).toEqual({ command: "ready" });
  });

  it("parses a title message", () => {
    expect(parseWebviewMessage({ command: "title", title: "My Game" })).toEqual({
      command: "title", title: "My Game",
    });
  });

  it("parses an error message", () => {
    expect(parseWebviewMessage({ command: "error", message: "boom" })).toEqual({
      command: "error", message: "boom",
    });
  });

  it("parses a saved message", () => {
    expect(parseWebviewMessage({ command: "saved", fileName: "a.png", data: "AA==" }))
      .toEqual({ command: "saved", fileName: "a.png", data: "AA==" });
  });

  it("rejects non-objects and unknown commands", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ command: "launch" })).toBeUndefined();
  });

  it("rejects messages with wrong field types", () => {
    expect(parseWebviewMessage({ command: "title", title: 42 })).toBeUndefined();
    expect(parseWebviewMessage({ command: "error" })).toBeUndefined();
    expect(parseWebviewMessage({ command: "saved", fileName: "a.png" })).toBeUndefined();
    expect(parseWebviewMessage({ command: "saved", fileName: 1, data: "x" })).toBeUndefined();
  });
});
