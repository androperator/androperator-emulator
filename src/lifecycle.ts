import { validateAvdName, validateSystemImage } from "./validation.js";
// Ported from Androperator; adaptations recorded in docs/provenance.md.
import { setTimeout as delay } from "node:timers/promises";
import { readFile, writeFile } from "node:fs/promises";
import { runAdb, listDevices } from "./adbClient.js";
import type { RuntimeConfig } from "./runtimeConfig.js";
import { runAndroidSdkTool } from "./hostToolClient.js";
import { type EmulatorError, ERROR_CODES } from "./errors.js";
import {
  ADB_REGISTRATION_TIMEOUT_MS,
  BOOT_POLL_INTERVAL_MS,
  EMULATOR_DATA_PARTITION_SIZE_PATTERN,
  EMULATOR_BOOT_TIMEOUT_MS,
} from "./constants.js";
import { getAvdConfigPath, inspectConfiguredAvd } from "./configuredAvds.js";
import { isEmulatorBooted, resolveRunningEmulatorByName } from "./runningEmulators.js";

function buildError(
  code: EmulatorError["code"],
  message: string,
  details?: Record<string, unknown>
): EmulatorError {
  return { code, message, details };
}

export function normalizeEmulatorDataPartitionSize(size: string): string {
  const normalized = size.trim().toUpperCase();
  const match = normalized.match(EMULATOR_DATA_PARTITION_SIZE_PATTERN);
  if (!match) {
    throw buildError(
      ERROR_CODES.ANDROID_AVD_CREATE_FAILED,
      "Emulator data partition size must be a positive integer followed by G or GB",
      { value: size, expectedFormat: "<positive_integer>G|GB" }
    );
  }
  return `${match[1]}G`;
}

async function setAvdConfigValue(path: string, key: string, value: string): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    throw buildError(
      ERROR_CODES.ANDROID_AVD_CREATE_FAILED,
      `Failed to read created AVD config at ${path}`,
      { path, cause: error instanceof Error ? error.message : String(error) }
    );
  }

  const line = `${key}=${value}`;
  const lines = contents.length > 0 ? contents.split("\n") : [];
  const index = lines.findIndex((existing) => existing.trimStart().startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = line;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines[lines.length - 1] = line;
      lines.push("");
    } else {
      lines.push(line);
    }
  }
  try {
    await writeFile(path, lines.join("\n"), "utf8");
  } catch (error) {
    throw buildError(
      ERROR_CODES.ANDROID_AVD_CREATE_FAILED,
      `Failed to write AVD config at ${path}`,
      { path, key, value, cause: error instanceof Error ? error.message : String(error) }
    );
  }
}

export async function setAvdDataPartitionSize(
  name: string,
  size: string
): Promise<void> {
  await setAvdConfigValue(await getAvdConfigPath(name), "disk.dataPartition.size", normalizeEmulatorDataPartitionSize(size));
}

async function deleteCreatedAvdAfterFailedConfigUpdate(
  config: RuntimeConfig,
  name: string,
  cause: unknown
): Promise<never> {
  const result = await runAndroidSdkTool(config, "avdmanager", ["delete", "avd", "--name", name], {
    timeoutMs: 60_000,
  });
  const typedCause = cause as { message?: string; details?: Record<string, unknown> };
  throw buildError(
    ERROR_CODES.ANDROID_AVD_CREATE_FAILED,
    typedCause.message ?? `Failed to configure Android Virtual Device ${name}`,
    {
      ...(typedCause.details ?? {}),
      name,
      cleanup: {
        attempted: true,
        succeeded: result.code === 0,
        stderr: result.stderr,
      },
    }
  );
}

export async function isSystemImageInstalled(config: RuntimeConfig, systemImage: string): Promise<boolean> {
  const result = await runAndroidSdkTool(config, "sdkmanager", ["--list_installed"], { timeoutMs: 30_000 });
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.ANDROID_SYSTEM_IMAGE_INSTALL_FAILED,
      result.stderr || "Failed to query installed Android system images",
      { systemImage }
    );
  }
  return result.stdout.split("\n").some((line) => {
    // Legacy sdkmanager uses semicolon IDs and pipes; the Android CLI shim
    // uses slash IDs and whitespace columns. Compare the entire first token.
    const packageId = line.trim().split(/[\s|]+/, 1)[0].replaceAll("/", ";");
    return packageId === systemImage;
  });
}

export async function acceptAndroidSdkLicenses(config: RuntimeConfig): Promise<void> {
  const result = await runAndroidSdkTool(config, "sdkmanager", ["--licenses"], {
    timeoutMs: 120_000,
    input: "y\n".repeat(100),
  });
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.ANDROID_SYSTEM_IMAGE_INSTALL_FAILED,
      result.stderr || "Failed to accept Android SDK licenses"
    );
  }
}

export async function ensureSystemImageInstalled(
  config: RuntimeConfig,
  systemImage: string,
  options: { acceptLicenses?: boolean } = {}
): Promise<void> {
  validateSystemImage(systemImage);
  if (await isSystemImageInstalled(config, systemImage)) {
    return;
  }

  if (options.acceptLicenses) await acceptAndroidSdkLicenses(config);
  const result = await runAndroidSdkTool(config, "sdkmanager", [systemImage], { timeoutMs: 300_000 });
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.ANDROID_SYSTEM_IMAGE_INSTALL_FAILED,
      result.stderr || "Failed to install Android system image",
      { systemImage }
    );
  }
  if (!(await isSystemImageInstalled(config, systemImage))) {
    throw buildError(
      ERROR_CODES.ANDROID_SYSTEM_IMAGE_INSTALL_FAILED,
      "System image remains uninstalled; accept its SDK license before retrying, or explicitly set acceptLicenses",
      { systemImage }
    );
  }
}

export async function createAvd(
  config: RuntimeConfig,
  options: {
    name: string;
    systemImage: string;
    deviceProfile: string;
    dataPartitionSize: string;
    replace?: boolean;
    acceptLicenses?: boolean;
  }
): Promise<void> {
  const systemImage = options.systemImage;
  const deviceProfile = options.deviceProfile;
  const dataPartitionSize = normalizeEmulatorDataPartitionSize(options.dataPartitionSize);
  validateAvdName(options.name);
  const existedBeforeCreate = (await inspectConfiguredAvd(options.name)).exists;

  validateSystemImage(systemImage);
  if (!deviceProfile.trim() || deviceProfile.startsWith("-")) {
    throw buildError(ERROR_CODES.INVALID_ARGUMENT, "deviceProfile must be a nonblank hardware profile ID");
  }
  if (existedBeforeCreate) {
    if (!options.replace) throw buildError(ERROR_CODES.ANDROID_AVD_ALREADY_EXISTS, `AVD ${options.name} already exists; set replace only to discard its data`, { name: options.name });
    await assertAvdStopped(config, options.name);
  }
  await ensureSystemImageInstalled(config, systemImage, { acceptLicenses: options.acceptLicenses });
  const result = await runAndroidSdkTool(
    config,
    "avdmanager",
    ["create", "avd", ...(options.replace ? ["--force"] : []), "--name", options.name, "--package", systemImage, "--device", deviceProfile],
    { timeoutMs: 120_000, input: "no\n" }
  );
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.ANDROID_AVD_CREATE_FAILED,
      result.stderr || "Failed to create Android Virtual Device",
      { name: options.name, systemImage, deviceProfile }
    );
  }

  try {
    await setAvdDataPartitionSize(options.name, dataPartitionSize);
  } catch (error) {
    if (!existedBeforeCreate) {
      await deleteCreatedAvdAfterFailedConfigUpdate(config, options.name, error);
    }
    throw error;
  }
}

export async function startAvd(
  config: RuntimeConfig,
  name: string,
  extraArgs: string[] = []
): Promise<void> {
  validateAvdName(name);
  const args = [`@${name}`, "-no-snapshot-load", "-no-boot-anim", ...extraArgs];
  const child = config.runner.spawn(config.emulatorPath, args, {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    shell: false,
  });
  if (child && typeof child.once === "function") {
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error: Error) => reject(buildError(ERROR_CODES.EMULATOR_START_FAILED, error.message, { name })));
    });
  }
  if (child && typeof child.unref === "function") {
    child.unref();
  }
}

export async function waitForEmulatorRegistration(
  config: RuntimeConfig,
  name: string,
  timeoutMs: number = ADB_REGISTRATION_TIMEOUT_MS
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const running = await resolveRunningEmulatorByName(config, name);
    if (running) {
      return running.serial;
    }
    await delay(BOOT_POLL_INTERVAL_MS);
  }

  throw buildError(
    ERROR_CODES.EMULATOR_START_FAILED,
    `Timed out waiting for emulator ${name} to appear in adb`,
    { name, timeoutMs }
  );
}

export async function waitForBootCompletion(
  config: RuntimeConfig,
  serial: string,
  timeoutMs: number = EMULATOR_BOOT_TIMEOUT_MS
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isEmulatorBooted(config, serial)) {
      return;
    }
    await delay(BOOT_POLL_INTERVAL_MS);
  }

  throw buildError(
    ERROR_CODES.EMULATOR_BOOT_TIMEOUT,
    `Timed out waiting for emulator ${serial} to finish booting`,
    { serial, timeoutMs }
  );
}

export async function stopAvd(config: RuntimeConfig, name: string): Promise<void> {
  const running = await resolveRunningEmulatorByName(config, name);
  if (!running) {
    throw buildError(ERROR_CODES.EMULATOR_NOT_RUNNING, `Emulator ${name} is not running`, { name });
  }

  const result = await runAdb({ ...config, deviceId: running.serial }, ["emu", "kill"]);
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.EMULATOR_STOP_FAILED,
      result.stderr || `Failed to stop emulator ${name}`,
      { name, serial: running.serial }
    );
  }
}

export async function deleteAvd(config: RuntimeConfig, name: string): Promise<void> {
  validateAvdName(name);
  await assertAvdStopped(config, name);

  const existing = await inspectConfiguredAvd(name);
  if (!existing.exists) {
    throw buildError(ERROR_CODES.EMULATOR_NOT_FOUND, `AVD ${name} does not exist`, { name });
  }

  const result = await runAndroidSdkTool(config, "avdmanager", ["delete", "avd", "--name", name], {
    timeoutMs: 60_000,
  });
  if (result.code !== 0) {
    throw buildError(
      ERROR_CODES.EMULATOR_DELETE_FAILED,
      result.stderr || `Failed to delete emulator ${name}`,
      { name }
    );
  }
}

async function assertAvdStopped(config: RuntimeConfig, name: string): Promise<void> {
  const devices = await listDevices(config);
  if (devices.some((device) => device.serial.startsWith("emulator-") && device.state !== "device")) {
    throw buildError(ERROR_CODES.EMULATOR_ALREADY_RUNNING, "Cannot safely modify an AVD while an emulator is offline or unauthorized");
  }
  const running = await resolveRunningEmulatorByName(config, name, devices);
  if (running) {
    throw buildError(
      ERROR_CODES.EMULATOR_ALREADY_RUNNING,
      `Cannot modify running emulator ${name}`,
      { name, serial: running.serial }
    );
  }

}
