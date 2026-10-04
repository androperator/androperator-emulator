#!/usr/bin/env node
import { parseArgs } from "node:util";
import { getDefaultRuntimeConfig, listRunningEmulators, listConfiguredAvds, inspectConfiguredAvd,
  createAvd, startAvd, stopAvd, deleteAvd, waitForBootCompletion, waitForEmulatorRegistration,
  ensureSystemImageInstalled, setAvdDataPartitionSize } from "./index.js";

const commands = {
  list: "list", inspect: "inspect <name>", status: "status",
  download: "download <system-image> [--accept-licenses]",
  create: "create <name> --image <system-image> --profile <hardware-profile> --storage-size <12G> [--replace] [--accept-licenses]",
  start: "start <name> [--headless]", stop: "stop <name>", delete: "delete <name>",
  wait: "wait <serial> [--timeout-ms <180000>]", storage: "storage <name> --storage-size <12G>",
};

function usage(message: string): never {
  throw { code: "USAGE", message, details: { commands, example: "androperator-emulator inspect My_AVD" } };
}

async function main(): Promise<unknown> {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: "boolean", short: "h" }, version: { type: "boolean" }, json: { type: "boolean" },
    output: { type: "string" }, image: { type: "string" }, profile: { type: "string" },
    "storage-size": { type: "string" }, replace: { type: "boolean" },
    "accept-licenses": { type: "boolean" }, headless: { type: "boolean" }, "timeout-ms": { type: "string" },
  } });
  if (values.output !== undefined && values.output !== "json") usage("--output supports json; for example --output json list");
  if (values.version) return { name: "androperator-emulator", version: "0.1.0", protocolVersion: 1 };
  if (values.help) return { commands, output: "One JSON envelope on stdout; exit 0 success, 1 operation failure, 2 usage error" };
  const [command, target, ...extra] = positionals;
  if (!Object.hasOwn(commands, command ?? "")) usage(`Unknown or missing command: ${command ?? ""}; use --help`);
  const needsTarget = !["list", "status"].includes(command);
  if (extra.length || (needsTarget ? target === undefined || target.trim() === "" : target !== undefined)) usage(`Use ${commands[command as keyof typeof commands]}`);
  const allowed: Record<string, string[]> = {
    create: ["image", "profile", "storage-size", "replace", "accept-licenses"],
    download: ["accept-licenses"], start: ["headless"], wait: ["timeout-ms"], storage: ["storage-size"],
  };
  for (const flag of Object.keys(values)) {
    if (!["json", "output", ...(allowed[command] ?? [])].includes(flag)) usage(`--${flag} is not valid for ${command}; use ${commands[command as keyof typeof commands]}`);
  }
  function required(flag: "image" | "profile" | "storage-size"): string {
    const value = values[flag];
    if (value === undefined || !value.trim()) usage(`--${flag} requires a nonblank value; use ${commands[command as keyof typeof commands]}`);
    return value;
  }
  const config = getDefaultRuntimeConfig();
  switch (command) {
    case "status": return { devices: await listRunningEmulators(config) };
    case "list": {
      const running = await listRunningEmulators(config);
      return { avds: await listConfiguredAvds(config, new Set(running.map((item) => item.avdName))) };
    }
    case "inspect": {
      const running = await listRunningEmulators(config);
      return inspectConfiguredAvd(target, new Set(running.map((item) => item.avdName)));
    }
    case "download":
      await ensureSystemImageInstalled(config, target, { acceptLicenses: values["accept-licenses"] });
      return { systemImage: target, installed: true };
    case "create":
      await createAvd(config, { name: target, systemImage: required("image"), deviceProfile: required("profile"),
        dataPartitionSize: required("storage-size"), replace: values.replace, acceptLicenses: values["accept-licenses"] });
      return inspectConfiguredAvd(target);
    case "start": {
      if (!(await inspectConfiguredAvd(target)).exists) throw { code: "EMULATOR_NOT_FOUND", message: `AVD ${target} not found; use list` };
      if ((await listRunningEmulators(config)).some((item) => item.avdName === target)) throw { code: "EMULATOR_ALREADY_RUNNING", message: `AVD ${target} is already running; use status` };
      await startAvd(config, target, values.headless ? ["-no-window", "-no-audio"] : []);
      const serial = await waitForEmulatorRegistration(config, target);
      await waitForBootCompletion(config, serial);
      return { avdName: target, serial, booted: true };
    }
    case "wait": {
      const timeout = values["timeout-ms"];
      if (timeout !== undefined && (!/^[1-9]\d*$/.test(timeout) || !Number.isSafeInteger(Number(timeout)))) usage("--timeout-ms must be a positive integer, for example 180000");
      if (!/^emulator-\d+$/.test(target)) usage("wait requires an emulator serial, for example emulator-5554");
      await waitForBootCompletion(config, target, timeout === undefined ? undefined : Number(timeout));
      return { serial: target, booted: true };
    }
    case "stop": await stopAvd(config, target); return { avdName: target, stopped: true };
    case "delete": await deleteAvd(config, target); return { avdName: target, deleted: true };
    case "storage": await setAvdDataPartitionSize(target, required("storage-size")); return { avdName: target, configured: true, resized: false };
    default: return usage("Use --help");
  }
}

try {
  const data = await main();
  console.log(JSON.stringify({ protocolVersion: 1, ok: true, data }));
} catch (error) {
  const value = error as { code?: string; message?: string; details?: unknown };
  const isUsage = value.code === "USAGE" || value.code?.startsWith("ERR_PARSE_ARGS");
  console.log(JSON.stringify({ protocolVersion: 1, ok: false, error: {
    code: isUsage ? "USAGE" : value.code ?? "EMULATOR_ERROR",
    message: value.message ?? String(error), ...(value.details === undefined ? {} : { details: value.details }),
  } }));
  process.exitCode = isUsage ? 2 : 1;
}
