import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const localPython = resolve(root, ".venv/bin/python");
const python = process.env.PYTHON ?? (existsSync(localPython) ? localPython : "python3");
const children = [];
let stopping = false;

function loadBackendSecrets() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
  const allowed = new Set(["TDX_CLIENT_ID", "TDX_CLIENT_SECRET", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_BASE_URL"]);
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !allowed.has(match[1]) || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function start(label, command, args, env = process.env) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", env });
  child.on("error", (error) => {
    process.stderr.write(`[${label}] ${error.message}\n`);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(`[${label}] exited (${signal ?? code}); dependent services may be unavailable.\n`);
    }
  });
  children.push(child);
}

start("api", python, [
  "-m",
  "uvicorn",
  "api.main:app",
  "--host",
  "127.0.0.1",
  "--reload",
  "--port",
  "8000",
], { ...process.env, ...loadBackendSecrets() });
start("web", process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]);

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
