// Direct probe: boot bridge, register onBeforeStop, call handle.stop(),
// verify onBeforeStop fires.
import { spawn } from "node:child_process";
import fs from "node:fs";


// Clean state
try {
  fs.unlinkSync(".wisp/live/port.lock");
} catch {}

// Spawn the live process
const child = spawn("node", ["dist/index.js", "live", "--non-interactive", "--quiet"], {
  stdio: "pipe",
  cwd: process.cwd(),
});

let stdoutBuf = "";
child.stdout.on("data", (c) => (stdoutBuf += c));
child.stderr.on("data", (c) => process.stderr.write("CHILD-STDERR: " + c));

// Wait for boot
await new Promise((r) => setTimeout(r, 2500));

const lock = JSON.parse(fs.readFileSync(".wisp/live/port.lock", "utf8"));
console.log("BEFORE /stop: lock pid=" + lock.pid + " port=" + lock.port);
console.log("child.pid=" + child.pid);

// HTTP /stop
const res = await fetch(`http://127.0.0.1:${lock.port}/stop`);
console.log("/stop status: " + res.status + " body: " + (await res.text()).slice(0, 100));

await new Promise((r) => setTimeout(r, 3000));

const lockExists = fs.existsSync(".wisp/live/port.lock");
console.log("AFTER /stop: lock exists? " + lockExists);
console.log("child.killed=" + child.killed + " exitCode=" + child.exitCode);

if (!child.killed && child.exitCode === null) {
  console.log("Killing child manually...");
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
}

if (lockExists) {
  try { fs.unlinkSync(".wisp/live/port.lock"); } catch {}
}
console.log("done.");
process.exit(0);
