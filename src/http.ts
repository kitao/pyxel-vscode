import type * as vscode from "vscode";
import * as https from "https";

const REQUEST_TIMEOUT_MS = 30 * 1000;

export function httpsGet(
  url: string,
  maxRedirects = 5,
  token?: vscode.CancellationToken
): Promise<Buffer> {
  if (maxRedirects < 0) {
    return Promise.reject(new Error("Too many redirects"));
  }
  if (token?.isCancellationRequested) {
    return Promise.reject(new Error("Request cancelled"));
  }

  const controller = token ? new AbortController() : undefined;
  const cancellation = token?.onCancellationRequested(() => {
    controller?.abort();
  });
  if (token?.isCancellationRequested) controller?.abort();
  return request(url, maxRedirects, controller?.signal)
    .finally(() => cancellation?.dispose());
}

export function isRedirectStatus(statusCode: number | undefined): boolean {
  return statusCode === 301 || statusCode === 302 || statusCode === 303 ||
    statusCode === 307 || statusCode === 308;
}

export function resolveRedirectUrl(
  currentUrl: string,
  location: string
): string {
  return new URL(location, currentUrl).toString();
}

function request(
  url: string,
  remainingRedirects: number,
  signal?: AbortSignal
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request cancelled"));
      return;
    }

    const options: https.RequestOptions = {
      headers: { "User-Agent": "pyxel-vscode" },
      signal,
    };
    let clientRequest: ReturnType<typeof https.get>;
    try {
      clientRequest = https.get(url, options, (response) => {
        if (isRedirectStatus(response.statusCode)) {
          response.resume();
          if (remainingRedirects === 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          const location = response.headers.location;
          if (!location) {
            reject(new Error(`Redirect missing Location for ${url}`));
            return;
          }
          let redirectUrl: string;
          try {
            redirectUrl = resolveRedirectUrl(url, location);
          } catch {
            reject(new Error(
              `Invalid redirect Location for ${url}: ${location}`
            ));
            return;
          }
          resolve(request(redirectUrl, remainingRedirects - 1, signal));
          return;
        }

        const statusCode = response.statusCode;
        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode} for ${url}`));
          response.resume();
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      });
    } catch (error: unknown) {
      reject(error);
      return;
    }
    clientRequest.setTimeout(REQUEST_TIMEOUT_MS, () => {
      clientRequest.destroy(new Error(`Request timed out for ${url}`));
    });
    clientRequest.on("error", reject);
  });
}
