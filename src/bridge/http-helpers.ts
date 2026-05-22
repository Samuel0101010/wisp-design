// wisp-design — HTTP plumbing shared by bridge/server.ts.
//
// Pure helpers: response shaping, query parsing, body draining. Anything
// stateless that the server router would otherwise inline. Kept in its own
// file so server.ts stays under the 500-line budget.

import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  BridgeHttpErrorSchema,
  type AuthError,
  type BridgeHttpError,
} from "../contracts/bridge.js";

export interface Query {
  token: string | undefined;
  path: string | undefined;
  timeout: number | undefined;
  leaseMs: number | undefined;
  cursor: string | undefined;
}

export function errorBody(
  code: string,
  message: string,
  detail?: unknown,
): BridgeHttpError {
  return BridgeHttpErrorSchema.parse(
    detail === undefined
      ? { error: { code, message } }
      : { error: { code, message, detail } },
  );
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  detail?: unknown,
): void {
  sendJson(res, status, errorBody(code, message, detail));
}

export function sendAuthError(res: ServerResponse, err: AuthError): void {
  const status =
    err.code === "FORBIDDEN" || err.code === "PATH_TRAVERSAL" ? 403 : 401;
  sendError(res, status, err.code, err.message, err.detail);
}

function extractBearer(req: IncomingMessage): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth !== "string") return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m === null ? undefined : m[1];
}

export function parseQuery(req: IncomingMessage): Query {
  const u = new URL(req.url ?? "/", "http://localhost");
  const get = (k: string): string | undefined => {
    const v = u.searchParams.get(k);
    return v === null ? undefined : v;
  };
  const timeoutRaw = get("timeout");
  const leaseRaw = get("leaseMs");
  return {
    token: get("token") ?? extractBearer(req),
    path: get("path"),
    timeout: timeoutRaw === undefined ? undefined : Number.parseInt(timeoutRaw, 10),
    leaseMs: leaseRaw === undefined ? undefined : Number.parseInt(leaseRaw, 10),
    cursor: get("cursor"),
  };
}

export function urlPath(req: IncomingMessage): string {
  const u = new URL(req.url ?? "/", "http://localhost");
  return u.pathname;
}

export async function readBody(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}

export function safeJson(
  s: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(s) as unknown };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor.length === 0) return 0;
  const m = /^seq-(\d+)-/.exec(cursor);
  if (m === null || m[1] === undefined) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}
