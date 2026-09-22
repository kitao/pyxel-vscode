import { describe, expect, it } from "vitest";
import { parseWebviewMessage } from "../messages";

describe("parseWebviewMessage", () => {
  it("parses a ready message", () => {
    expect(parseWebviewMessage({ command: "ready" })).toEqual({
      command: "ready",
    });
  });

  it("parses a title message", () => {
    expect(parseWebviewMessage({
      command: "title",
      title: "My Game",
    })).toEqual({ command: "title", title: "My Game" });
  });

  it("parses an error message", () => {
    expect(parseWebviewMessage({ command: "error", message: "boom" })).toEqual({
      command: "error", message: "boom",
    });
  });

  it("parses stdout messages", () => {
    expect(parseWebviewMessage({ command: "log", message: "diagnostic" }))
      .toEqual({ command: "log", message: "diagnostic" });
  });

  it("parses a saved message", () => {
    expect(parseWebviewMessage({
      command: "saved",
      fileName: "a.png",
      data: "AA==",
    })).toEqual({ command: "saved", fileName: "a.png", data: "AA==" });
  });

  it("accepts capture session IDs and rejects invalid ones", () => {
    const capture = { command: "saved", sessionId: 0, fileName: "a.png", data: "AA==" };
    expect(parseWebviewMessage(capture)).toEqual(capture);
    for (const sessionId of [-1, 0.5, "0", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseWebviewMessage({ ...capture, sessionId })).toBeUndefined();
    }
  });

  it("rejects non-objects and unknown commands", () => {
    expect(parseWebviewMessage(null)).toBeUndefined();
    expect(parseWebviewMessage("ready")).toBeUndefined();
    expect(parseWebviewMessage({ command: "launch" })).toBeUndefined();
  });

  it("rejects messages with wrong field types", () => {
    expect(parseWebviewMessage({
      command: "title",
      title: 42,
    })).toBeUndefined();
    expect(parseWebviewMessage({ command: "error" })).toBeUndefined();
    expect(parseWebviewMessage({
      command: "saved",
      fileName: "a.png",
    })).toBeUndefined();
    expect(parseWebviewMessage({
      command: "saved",
      fileName: 1,
      data: "x",
    })).toBeUndefined();
  });

  it("rejects saved messages with invalid base64 data", () => {
    expect(parseWebviewMessage({
      command: "saved", fileName: "a.png", data: "not base64!",
    })).toBeUndefined();
  });
});
