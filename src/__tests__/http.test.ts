import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import type { ClientRequest, IncomingMessage } from "http";
import * as https from "https";
import { PassThrough } from "stream";
import {
  httpsGet,
  isRedirectStatus,
  resolveRedirectUrl,
} from "../http";

vi.mock("https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("https")>();
  return { ...actual, get: vi.fn(actual.get) };
});

afterEach(async () => {
  const actual = await vi.importActual<typeof import("https")>("https");
  vi.mocked(https.get).mockReset().mockImplementation(actual.get);
});

function mockResponse(
  statusCode: number,
  body: string,
  headers: IncomingMessage["headers"] = {}
): void {
  const fakeGet = (
    _url: string | URL,
    _options: https.RequestOptions,
    callback: (response: IncomingMessage) => void
  ) => {
    const stream = new PassThrough();
    const response = stream as unknown as IncomingMessage;
    response.statusCode = statusCode;
    response.headers = headers;
    const request = new EventEmitter() as unknown as ClientRequest;
    request.setTimeout = vi.fn().mockReturnValue(request);
    request.destroy = vi.fn().mockReturnValue(request);
    queueMicrotask(() => {
      callback(response);
      stream.end(body);
    });
    return request;
  };
  vi.mocked(https.get).mockImplementationOnce(fakeGet as typeof https.get);
}

describe("httpsGet", () => {
  it("recognizes supported redirect status codes", () => {
    expect(isRedirectStatus(301)).toBe(true);
    expect(isRedirectStatus(302)).toBe(true);
    expect(isRedirectStatus(303)).toBe(true);
    expect(isRedirectStatus(307)).toBe(true);
    expect(isRedirectStatus(308)).toBe(true);
    expect(isRedirectStatus(200)).toBe(false);
    expect(isRedirectStatus(undefined)).toBe(false);
  });

  it("allows exactly the configured number of redirects", async () => {
    mockResponse(302, "", { location: "/final" });
    mockResponse(200, "ok");

    const result = await httpsGet("https://example.com/start", 1);

    expect(result.toString()).toBe("ok");
  });

  it("rejects a redirect beyond the configured limit", async () => {
    mockResponse(302, "", { location: "/final" });

    await expect(httpsGet("https://example.com/start", 0)).rejects.toEqual(
      new Error("Too many redirects")
    );
  });

  it("rejects a redirect without a location", async () => {
    mockResponse(302, "");

    await expect(httpsGet("https://example.com/start")).rejects.toEqual(
      new Error("Redirect missing Location for https://example.com/start")
    );
  });

  it("rejects an invalid redirect location", async () => {
    mockResponse(302, "", { location: "http://[" });

    await expect(httpsGet("https://example.com/start")).rejects.toEqual(
      new Error(
        "Invalid redirect Location for https://example.com/start: http://["
      )
    );
  });

  it("rejects non-success HTTP responses", async () => {
    mockResponse(304, "cached");

    await expect(httpsGet("https://example.com/file")).rejects.toEqual(
      new Error("HTTP 304 for https://example.com/file")
    );
  });

  it("rejects synchronous request errors", async () => {
    vi.mocked(https.get).mockImplementationOnce(() => {
      throw new Error("request failed");
    });

    await expect(httpsGet("https://example.com/file")).rejects.toEqual(
      new Error("request failed")
    );
  });

  it("does not start a request after cancellation", async () => {
    const token = {
      isCancellationRequested: true,
      onCancellationRequested: vi.fn(),
    };

    await expect(
      httpsGet("https://example.com/file", 5, token)
    ).rejects.toEqual(new Error("Request cancelled"));
    expect(https.get).not.toHaveBeenCalled();
  });

  it("resolves relative redirect locations against the current URL", () => {
    expect(resolveRedirectUrl(
      "https://example.com/python/file.py",
      "../other.py"
    )).toBe("https://example.com/other.py");
  });
});
