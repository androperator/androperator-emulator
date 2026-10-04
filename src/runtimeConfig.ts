import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NodeProcessRunner, type ProcessRunner } from "./processRunner.js";

export interface RuntimeConfig {
  adbPath: string;
  emulatorPath: string;
  sdkmanagerPath: string;
  avdmanagerPath: string;
  runner: ProcessRunner;
  /** Optional consumer ADB adapter, for diagnostics and logging. */
  adb?: (args: string[], options?: { timeoutMs?: number }) => ReturnType<ProcessRunner["run"]>;
  deviceId?: string;
}

export function getDefaultRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    join(homedir(), "Library", "Android", "sdk"), join(homedir(), "Android", "Sdk")]
    .filter((root): root is string => root !== undefined && root.length > 0);
  function tool(name: string, relativePath: string, env: string): string {
    const explicit = process.env[env];
    if (explicit !== undefined) {
      if (!explicit.trim()) throw new Error(`${env} must not be blank`);
      return explicit;
    }
    return sdkRoots.map((root) => join(root, relativePath)).find(existsSync) ?? name;
  }
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined));
  return {
    adbPath: tool("adb", "platform-tools/adb", "ADB_PATH"),
    emulatorPath: tool("emulator", "emulator/emulator", "EMULATOR_PATH"),
    sdkmanagerPath: tool("sdkmanager", "cmdline-tools/latest/bin/sdkmanager", "SDKMANAGER_PATH"),
    avdmanagerPath: tool("avdmanager", "cmdline-tools/latest/bin/avdmanager", "AVDMANAGER_PATH"),
    runner: new NodeProcessRunner(),
    ...defined,
  };
}
