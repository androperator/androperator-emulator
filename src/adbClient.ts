// Ported ADB selection and device parsing; consumer logging is injected.
import type { RuntimeConfig } from "./runtimeConfig.js";
import { ERROR_CODES } from "./errors.js";

export function runAdb(config: RuntimeConfig, args: string[], options?: { timeoutMs?: number }) {
  const deviceArgs = config.deviceId ? ["-s", config.deviceId, ...args] : args;
  return config.adb ? config.adb(deviceArgs, options) : config.runner.run(config.adbPath, deviceArgs, options);
}

export interface DeviceInfo { serial: string; state: string }
export async function listDevices(config: RuntimeConfig): Promise<DeviceInfo[]> {
  const result = await runAdb({ ...config, deviceId: undefined }, ["devices"]);
  if (result.code !== 0 || !result.stdout.includes("List of devices attached")) {
    throw { code: ERROR_CODES.ADB_QUERY_FAILED, message: result.stderr || "Failed to query adb devices; verify adb is available" };
  }
  return result.stdout.split("List of devices attached")[1].split("\n")
    .map((line) => line.trim()).filter(Boolean)
    .map((line) => { const [serial, state] = line.split(/\s+/); return { serial, state: state ?? "unknown" }; });
}
