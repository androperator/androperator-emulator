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
