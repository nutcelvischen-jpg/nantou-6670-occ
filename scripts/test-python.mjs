import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const localPython = resolve(root, ".venv/bin/python");
const python = process.env.PYTHON ?? (existsSync(localPython) ? localPython : "python3");
const modules = [
  "scripts.test_public_aggregates",
  "scripts.test_ntbus_6670_timetable",
  "api.test_road_router",
  "api.test_tdx_adapter",
  "api.test_fleet_optimizer",
  "api.test_assistant",
  "api.test_main",
];
const result = spawnSync(python, ["-m", "unittest", ...modules], {
  cwd: root,
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`[python tests] ${result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
