// Ported from Androperator test/unit/androidEmulatorsFoundation.test.ts; see docs/provenance.md.
import { describe, it } from "node:test";
import assert from "node:assert";
import { getDefaultRuntimeConfig } from "../runtimeConfig.js";
import { assertRequiredEmulatorTools, checkRequiredEmulatorTools } from "../hostRequirements.js";
import { ERROR_CODES } from "../errors.js";
import { FakeProcessRunner } from "./fakes/FakeProcessRunner.js";

describe("android emulator foundation", () => {
  it("checks required Android SDK host tools", async () => {
    const runner = new FakeProcessRunner();
    runner.queueResult({ code: 0, stdout: "adb help", stderr: "" });
    runner.queueResult({ code: 0, stdout: "emulator help", stderr: "" });
    runner.queueResult({ code: 0, stdout: "sdkmanager help", stderr: "" });
    runner.queueResult({ code: 0, stdout: "avdmanager help", stderr: "" });

    const config = getDefaultRuntimeConfig({ runner });
    const results = await checkRequiredEmulatorTools(config);

    assert.deepStrictEqual(results, [
      { tool: "adb", available: true },
      { tool: "emulator", available: true },
      { tool: "sdkmanager", available: true },
      { tool: "avdmanager", available: true },
    ]);
  });

  it("throws a structured error when a required tool is missing", async () => {
    const runner = new FakeProcessRunner();
    runner.queueResult({ code: 0, stdout: "adb help", stderr: "" });
    runner.queueError(127, "ENOENT");
    runner.queueResult({ code: 0, stdout: "sdkmanager help", stderr: "" });
    runner.queueResult({ code: 0, stdout: "avdmanager help", stderr: "" });

    const config = getDefaultRuntimeConfig({ runner });

    await assert.rejects(
      () => assertRequiredEmulatorTools(config),
      (error: unknown) => {
        const typed = error as { code: string; details?: { missingTools?: string[] } };
        assert.strictEqual(typed.code, ERROR_CODES.ANDROID_SDK_TOOL_MISSING);
        assert.deepStrictEqual(typed.details?.missingTools, ["emulator"]);
        return true;
      }
    );
  });
});
