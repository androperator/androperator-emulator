import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseHardwareProfiles, parseSystemImages, listHardwareProfiles, listSystemImages, getDefaultRuntimeConfig } from "../index.js";
import { FakeProcessRunner } from "./fakes/FakeProcessRunner.js";

const profiles = `Available devices definitions:
id: 0 or "tv_720p"
    Name: Television (720p)
    OEM : Google
    Tag : android-tv
---------
id: 12 or "pixel_7"
    Name: Pixel 7
    OEM : Google
`;
const image = "system-images;android-36;android-tv;arm64-v8a";
const legacy = `Installed packages:
  Path | Version | Description | Location
  ------- | ------- | ------- | -------
  ${image} | 3 | Android TV image | system-images/android-36/android-tv/arm64-v8a
Available Packages:
  ${image} | 4 | Android TV image
  system-images;android-37.2;google_apis_playstore_ps16k;arm64-v8a | 5 | 16 KB Google Play image
  system-images;android-Zebra;default;x86_64 | 1 | Preview image
Available Updates:
  ID | Installed | Available
  ${image} | 3 | 4
`;
const shim = `Installed packages:
  ${image.replaceAll(";", "/")}  3.0.0  Android TV image
Available packages:
  ${image.replaceAll(";", "/")}  4.0.0  Android TV image
  system-images/android-35/google_apis/x86_64  9.0.0  Google APIs image
`;

test("profiles return stable create identifiers and optional metadata", () => {
  assert.deepEqual(parseHardwareProfiles(profiles), [
    { id: "pixel_7", name: "Pixel 7", manufacturer: "Google", tag: null },
    { id: "tv_720p", name: "Television (720p)", manufacturer: "Google", tag: "android-tv" },
  ]);
  assert.deepEqual(parseHardwareProfiles("Available devices definitions:\n"), []);
  assert.throws(() => parseHardwareProfiles("different output"), { code: "ANDROID_CATALOG_QUERY_FAILED" });
  assert.throws(() => parseHardwareProfiles('id: 0 or "pixel_7"'), { code: "ANDROID_CATALOG_QUERY_FAILED" });
});

test("legacy catalogs combine installed and available versions without confusing updates", () => {
  const images = parseSystemImages(legacy);
  assert.equal(images.length, 3);
  assert.deepEqual(images.find((item) => item.id === image), {
    id: image, platform: "android-36", apiLevel: 36, tag: "android-tv", abi: "arm64-v8a",
    description: "Android TV image", installed: true, installedVersion: "3", availableVersion: "4",
  });
  assert.equal(images.find((item) => item.platform === "android-37.2")?.apiLevel, 37);
  assert.equal(images.find((item) => item.platform === "android-Zebra")?.apiLevel, null);
});

test("shim catalogs normalize IDs and retain revision strings", () => {
  const images = parseSystemImages(shim);
  assert.equal(images.length, 2);
  assert.equal(images.find((item) => item.id === image)?.installedVersion, "3.0.0");
  assert.equal(images.find((item) => item.id === image)?.availableVersion, "4.0.0");
  assert.equal(images.find((item) => item.abi === "x86_64")?.installed, false);
});

test("empty catalogs are valid but unrecognized or malformed output fails visibly", () => {
  assert.deepEqual(parseSystemImages("Installed packages:\nAvailable Packages:\n"), []);
  for (const output of ["unexpected output", "Installed packages:\nsystem-images;broken | 1 | Bad row"]) {
    assert.throws(() => parseSystemImages(output), { code: "ANDROID_CATALOG_QUERY_FAILED" });
  }
});

test("queries use fixed tool arguments, filter installed state, and propagate failures", async () => {
  const runner = new FakeProcessRunner();
  const config = getDefaultRuntimeConfig({ runner });
  runner.queueResult({ code: 0, stdout: profiles, stderr: "" });
  assert.equal((await listHardwareProfiles(config)).length, 2);
  runner.queueResult({ code: 0, stdout: shim, stderr: "" });
  assert.equal((await listSystemImages(config)).length, 2);
  runner.queueResult({ code: 0, stdout: shim, stderr: "" });
  assert.equal((await listSystemImages(config, { installedOnly: true })).length, 1);
  assert.deepEqual(runner.calls.map((call) => call.args), [["list", "device"], ["--list"], ["--list_installed"]]);
  runner.queueError(1, "network unavailable");
  await assert.rejects(listSystemImages(config), { code: "ANDROID_CATALOG_QUERY_FAILED", message: "network unavailable" });
  runner.queueError(127, "tool missing");
  await assert.rejects(listHardwareProfiles(config), { code: "ANDROID_CATALOG_QUERY_FAILED" });
});

test("CLI catalogs expose JSON, capabilities, strict options and operation errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "emulator-catalog-"));
  try {
    const tool = join(root, "sdk-tool");
    await writeFile(tool, `#!/bin/sh\ncase "$*" in\n'list device') cat <<'DATA'\n${profiles}\nDATA\n;;\n'--list'|'--list_installed') cat <<'DATA'\n${shim}\nDATA\n;;\nesac\n`, { mode: 0o755 });
    const run = (args: string[], overrides = {}) => spawnSync(process.execPath, [resolve("dist/cli.js"), ...args], {
      encoding: "utf8", env: { ...process.env, SDKMANAGER_PATH: tool, AVDMANAGER_PATH: tool, ...overrides },
    });
    for (const args of [["profiles"], ["--json", "profiles"], ["images", "--output", "json"], ["images", "--installed"], ["--installed", "images"]]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stdout);
      const envelope = JSON.parse(result.stdout);
      assert.equal(envelope.protocolVersion, 1);
      assert.equal(envelope.ok, true);
      assert.equal(result.stderr, "");
      if (args.includes("--installed")) assert.equal(envelope.data.images.length, 1);
    }
    assert.deepEqual(JSON.parse(run(["--version"]).stdout).data.capabilities, ["catalog.profiles", "catalog.images"]);
    for (const args of [["images", "extra"], ["profiles", "--installed"], ["images", "--profile", "tv_720p"], ["images", "--installed=false"]]) {
      const result = run(args);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(JSON.parse(result.stdout).error.code, "USAGE");
    }
    const failed = run(["images"], { SDKMANAGER_PATH: join(root, "missing") });
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).error.code, "ANDROID_CATALOG_QUERY_FAILED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
