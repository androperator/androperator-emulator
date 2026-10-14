import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { getDefaultRuntimeConfig, desktopHeadUnitStatus, installDesktopHeadUnit, runDesktopHeadUnit } from "../index.js";
import { FakeProcessRunner } from "./fakes/FakeProcessRunner.js";

async function fixture() {
  const sdkRoot = await mkdtemp(join(tmpdir(), "dhu-test-"));
  await mkdir(join(sdkRoot, "extras/google/auto"), { recursive: true });
  const executable = join(sdkRoot, "extras/google/auto", process.platform === "win32" ? "desktop-head-unit.exe" : "desktop-head-unit");
  const runner = new FakeProcessRunner();
  const config = getDefaultRuntimeConfig({ sdkRoot, runner });
  return { sdkRoot, executable, runner, config };
}
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

test("DHU status is read-only and installation preserves SDK licenses", async () => {
  const f = await fixture();
  try {
    assert.equal((await desktopHeadUnitStatus(f.config)).installed, false);
    f.runner.queueResult(ok(), () => writeFile(f.executable, "fixture", { mode: 0o600 }));
    assert.equal((await installDesktopHeadUnit(f.config)).executableReady, true);
    assert.deepEqual(f.runner.calls[0].args, ["extras;google;auto"]);
  } finally { await rm(f.sdkRoot, { recursive: true, force: true }); }
});

test("DHU launch selects the device, allocates a free port and removes only that forward", async () => {
  const f = await fixture();
  try {
    await writeFile(f.executable, "fixture", { mode: 0o700 });
    f.runner.queueResult(ok("device\n")); f.runner.queueResult(ok("41234\n")); f.runner.queueResult(ok());
    let launch: unknown;
    f.runner.spawn = (command, args, options) => {
      launch = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    };
    await runDesktopHeadUnit(f.config, "phone-serial");
    assert.deepEqual(f.runner.calls.map(c => c.args), [
      ["-s", "phone-serial", "get-state"],
      ["-s", "phone-serial", "forward", "tcp:0", "tcp:5277"],
      ["-s", "phone-serial", "forward", "--remove", "tcp:41234"],
    ]);
    assert.equal((launch as { args: string[] }).args[0], "--adb=127.0.0.1:41234");
  } finally { await rm(f.sdkRoot, { recursive: true, force: true }); }
});

test("DHU spawn failure and cancellation both clean up the forward", async () => {
  for (const cancel of [false, true]) {
    const f = await fixture();
    try {
      await writeFile(f.executable, "fixture", { mode: 0o700 });
      f.runner.queueResult(ok("device")); f.runner.queueResult(ok("41235")); f.runner.queueResult(ok());
      const controller = new AbortController();
      f.runner.spawn = () => {
        const child = new EventEmitter() as EventEmitter & { kill: () => void };
        child.kill = () => { queueMicrotask(() => child.emit("close", null)); };
        queueMicrotask(() => cancel ? controller.abort() : child.emit("error", new Error("launch failed")));
        return child;
      };
      const run = runDesktopHeadUnit(f.config, "phone", controller.signal);
      if (cancel) await run; else await assert.rejects(run, /launch failed/);
      assert.deepEqual(f.runner.calls.at(-1)?.args, ["-s", "phone", "forward", "--remove", "tcp:41235"]);
    } finally { await rm(f.sdkRoot, { recursive: true, force: true }); }
  }
});

test("DHU refuses unavailable devices before forwarding", async () => {
  const f = await fixture();
  try {
    await writeFile(f.executable, "fixture", { mode: 0o700 });
    f.runner.queueResult({ code: 1, stdout: "", stderr: "unauthorized" });
    await assert.rejects(runDesktopHeadUnit(f.config, "phone"), { code: "DHU_DEVICE_UNAVAILABLE" });
    assert.equal(f.runner.calls.length, 1);
    await assert.rejects(runDesktopHeadUnit(f.config, "-bad"), { code: "INVALID_ARGUMENT" });
  } finally { await rm(f.sdkRoot, { recursive: true, force: true }); }
});

test("CLI SIGTERM stops its DHU child and removes the allocated tunnel", async () => {
  const { spawn } = await import("node:child_process");
  const { readFile } = await import("node:fs/promises");
  const f = await fixture();
  try {
    const marker = join(f.sdkRoot, "started");
    const cleanup = join(f.sdkRoot, "cleanup");
    const adb = join(f.sdkRoot, "adb");
    await writeFile(adb, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nconst a=process.argv.slice(2);\nif(a.includes('get-state')) console.log('device');\nelse if(a.includes('--remove')) writeFileSync(${JSON.stringify(cleanup)}, a.join(' '));\nelse console.log('41300');\n`, { mode: 0o700 });
    await writeFile(f.executable, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, String(process.pid));\nsetInterval(()=>{},1000);\n`, { mode: 0o700 });
    const cli = spawn(process.execPath, [new URL("../cli.js", import.meta.url).pathname, "dhu-start", "test-phone"], {
      env: { ...process.env, ANDROID_HOME: f.sdkRoot, ADB_PATH: adb }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    cli.stdout.on("data", d => { output += d.toString(); });
    const exited = new Promise<number | null>((resolve, reject) => { cli.once("close", resolve); cli.once("error", reject); });
    try {
      let pid = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        pid = Number(await readFile(marker, "utf8").catch(() => "0"));
        if (pid) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(pid, "DHU child started");
      cli.kill("SIGTERM");
      assert.equal(await exited, 0);
      assert.equal(JSON.parse(output).data.stopped, true);
      assert.equal(await readFile(cleanup, "utf8"), "-s test-phone forward --remove tcp:41300");
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
    } finally { cli.kill("SIGTERM"); }
  } finally { await rm(f.sdkRoot, { recursive: true, force: true }); }
});
