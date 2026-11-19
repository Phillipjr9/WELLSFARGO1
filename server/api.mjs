import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  applyAction,
  createWorkspace,
  DemoError,
  settleDue,
} from "../shared/ledger.mjs";

const directory =
  process.env.DEMO_DATA_DIR ||
  join(homedir(), ".local", "share", "banking-preview", "ledgers-v2");
mkdirSync(directory, { recursive: true, mode: 0o700 });

function save(file, state) {
  writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

function getWorkspace(req, res, allowCreate = true) {
  const cookie = (req.headers.cookie || "").match(
    /(?:^|;\s*)banking_demo=([a-f0-9]{48})(?:;|$)/,
  )?.[1];
  const tabKey = req.headers["x-demo-workspace"];
  const id =
    cookie ||
    (typeof tabKey === "string" && /^[a-f0-9]{48}$/.test(tabKey)
      ? tabKey
      : null);
  if (id) {
    const file = join(directory, `${id}.json`);
    if (existsSync(file)) {
      const state = JSON.parse(readFileSync(file, "utf8"));
      if (settleDue(state)) save(file, state);
      res.setHeader("X-Demo-Workspace", id);
      return { file, state };
    }
  }
  if (!allowCreate)
    throw new DemoError(
      "This demo session has ended. Refresh the page to start a new workspace.",
      409,
    );
  const token = randomBytes(24).toString("hex");
  const file = join(directory, `${token}.json`);
  const state = createWorkspace();
  save(file, state);
  res.setHeader("X-Demo-Workspace", token);
  res.setHeader(
    "Set-Cookie",
    `banking_demo=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${req.socket.encrypted ? "; Secure" : ""}`,
  );
  return { file, state };
}

export async function demoApi(req, res, next) {
  const path = (req.url || "/").split("?")[0];
  if (!path.startsWith("/api/demo/")) return next();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    if (path === "/api/demo/workspace" && req.method === "GET") {
      res.end(JSON.stringify({ state: getWorkspace(req, res).state }));
      return;
    }
    if (
      req.method !== "POST" ||
      !["/api/demo/action", "/api/demo/exit"].includes(path)
    )
      throw new DemoError("Not found.", 404);
    if (req.headers["sec-fetch-site"] === "cross-site")
      throw new DemoError("Cross-site requests are not allowed.", 403);
    if (
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      throw new DemoError("Origin mismatch.", 403);
    if (!req.headers["content-type"]?.startsWith("application/json"))
      throw new DemoError("Use JSON for demo operations.", 415);
    if (path === "/api/demo/exit") {
      const { file } = getWorkspace(req, res, false);
      unlinkSync(file);
      res.removeHeader("X-Demo-Workspace");
      res.setHeader(
        "Set-Cookie",
        "banking_demo=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      res.end(JSON.stringify({ success: true }));
      return;
    }
    let body = "";
    for await (const part of req) {
      body += part;
      if (Buffer.byteLength(body) > 4096)
        throw new DemoError("Request too large.", 413);
    }
    let command;
    try {
      command = JSON.parse(body);
    } catch {
      throw new DemoError("Invalid JSON.", 400);
    }
    // Keep the read, validation and atomic replace together; no await between them.
    const { file, state } = getWorkspace(req, res, false);
    const output = applyAction(state, command);
    save(file, output.state);
    res.end(JSON.stringify(output));
  } catch (error) {
    res.statusCode = error instanceof DemoError ? error.code : 500;
    res.end(
      JSON.stringify({
        error:
          error instanceof DemoError
            ? error.message
            : "The demo could not save this change. Please try again.",
      }),
    );
  }
}
