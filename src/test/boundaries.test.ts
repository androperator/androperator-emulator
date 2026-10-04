import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { FakeProcessRunner } from "./fakes/FakeProcessRunner.js";
import { createAvd, deleteAvd, ensureSystemImageInstalled, getDefaultRuntimeConfig,
  inspectConfiguredAvd, setAvdDataPartitionSize, startAvd, NodeProcessRunner, isSystemImageInstalled } from "../index.js";

const image = "system-images;android-35;google_apis;arm64-v8a";
const options = { name: "test-avd", systemImage: image, deviceProfile: "pixel_7", dataPartitionSize: "12G" };
const success = (stdout = "") => ({ code: 0, stdout, stderr: "" });

test("replacement is explicit, validates first, and fails closed for unavailable ADB", async () => {
  const root = await mkdtemp(join(tmpdir(), "emulator-boundaries-"));
  const previous = process.env.ANDROID_AVD_HOME;
  process.env.ANDROID_AVD_HOME = root;
  try {
    await writeFile(join(root, "test-avd.ini"), "");
    const runner = new FakeProcessRunner();
    const config = getDefaultRuntimeConfig({ runner });
    await assert.rejects(createAvd(config, options), { code: "ANDROID_AVD_ALREADY_EXISTS" });
    await assert.rejects(createAvd(config, { ...options, dataPartitionSize: "wrong" }), { code: "ANDROID_AVD_CREATE_FAILED" });
    assert.equal(runner.calls.length, 0);
    runner.queueResult({ code: 1, stdout: "", stderr: "adb failed" });
    await assert.rejects(createAvd(config, { ...options, replace: true }), { code: "ADB_QUERY_FAILED" });
    runner.queueResult(success("List of devices attached\nemulator-5554\toffline\n"));
    await assert.rejects(deleteAvd(config, options.name), { code: "EMULATOR_ALREADY_RUNNING" });
    assert.ok(runner.calls.every((call) => call.command === config.adbPath));
  } finally {
    if (previous === undefined) delete process.env.ANDROID_AVD_HOME; else process.env.ANDROID_AVD_HOME = previous;
  }
});

test("inspection and storage follow the AVD locator path", async () => {
  const root = await mkdtemp(join(tmpdir(), "emulator-location-"));
  const previous = process.env.ANDROID_AVD_HOME;
  process.env.ANDROID_AVD_HOME = root;
  try {
    const custom = join(root, "custom-storage");
    await mkdir(custom);
    await writeFile(join(root, "test-avd.ini"), `path=${custom}\ntarget=android-34\n`);
    await writeFile(join(custom, "config.ini"), "hw.device.name=pixel_8\n");
    assert.equal((await inspectConfiguredAvd(options.name)).deviceProfile, "pixel_8");
    await setAvdDataPartitionSize(options.name, "24GB");
    assert.match(await readFile(join(custom, "config.ini"), "utf8"), /disk.dataPartition.size=24G/);
    await assert.rejects(inspectConfiguredAvd("../escape"), { code: "ANDROID_AVD_CREATE_FAILED" });
  } finally {
    if (previous === undefined) delete process.env.ANDROID_AVD_HOME; else process.env.ANDROID_AVD_HOME = previous;
  }
});

test("installation matches whole package IDs and does not accept licenses by default", async () => {
  const runner = new FakeProcessRunner();
  const config = getDefaultRuntimeConfig({ runner });
  runner.queueResult(success(`${image}-other | 1 | image`));
  assert.equal(await isSystemImageInstalled(config, image), false);
  runner.queueResult(success());
  runner.queueResult(success());
  runner.queueResult(success(`${image} | 9 | installed`));
  await ensureSystemImageInstalled(config, image);
  assert.deepEqual(runner.calls.at(-2)?.args, [image]);
  assert.ok(runner.calls.every((call) => !call.args.includes("--licenses")));
});

test("process runner reports missing executables, bounded timeout and detached spawn errors", async () => {
  const runner = new NodeProcessRunner();
  const missing = join(tmpdir(), "nonexistent-emulator-tool-123456789");
  assert.equal((await runner.run(missing, [])).code, 127);
  const result = await runner.run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 100 });
  assert.equal(result.code, null);
  assert.match(result.stderr, /timed out/);
  await assert.rejects(startAvd(getDefaultRuntimeConfig({ runner, emulatorPath: missing }), "test-avd"), { code: "EMULATOR_START_FAILED" });
});

test("CLI emits one JSON document with usage exit codes and global flag placement", () => {
  const cli = resolve("dist/cli.js");
  for (const args of [["--help"], ["--version"], ["--json", "--help"], ["--help", "--json"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).protocolVersion, 1);
  }
  for (const args of [[], ["unknown"], ["inspect"], ["list", "extra"], ["list", "--replace"],
    ["create", "test"], ["create", "test", "--image"], ["wait", "emulator-5554", "--timeout-ms", "0"],
    ["--output", "text", "list"], ["list", "--bogus"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, `${args}: ${result.stdout}`);
    assert.equal(JSON.parse(result.stdout).error.code, "USAGE");
    assert.equal(result.stderr, "");
  }
});

test("zero-exit skipped installation is not reported as success", async () => {
  const runner = new FakeProcessRunner();
  runner.queueResult(success());
  runner.queueResult(success("Skipping package because the license was not accepted"));
  runner.queueResult(success());
  await assert.rejects(ensureSystemImageInstalled(getDefaultRuntimeConfig({ runner }), image), { code: "ANDROID_SYSTEM_IMAGE_INSTALL_FAILED" });
});

test("timeout kills the owned process group including descendants holding output pipes", { skip: process.platform === "win32" }, async () => {
  const started = Date.now();
  const result = await new NodeProcessRunner().run("/bin/sh", ["-c", "sleep 10 & echo $!; wait"], { timeoutMs: 150 });
  assert.equal(result.code, null);
  assert.ok(Date.now() - started < 2000);
  const pid = Number(result.stdout.trim());
  assert.ok(pid > 0);
  // Give the host a moment to reap the killed descendant.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const state = spawnSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).stdout.trim();
  assert.ok(state === "" || state.startsWith("Z"), `descendant still alive: ${state}`);
});
