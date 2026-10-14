import { access, chmod, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import type { RuntimeConfig } from "./runtimeConfig.js";

export const desktopHeadUnitPackage = "extras;google;auto";

export function desktopHeadUnitPath(config: RuntimeConfig): string {
  const root = config.sdkRoot;
  if (!root) throw { code: "DHU_SDK_MISSING", message: "Set ANDROID_HOME or ANDROID_SDK_ROOT to use the Desktop Head Unit." };
  return join(root, "extras", "google", "auto", process.platform === "win32" ? "desktop-head-unit.exe" : "desktop-head-unit");
}

export async function desktopHeadUnitStatus(config: RuntimeConfig) {
  const executable = desktopHeadUnitPath(config);
  const installed = await stat(executable).then(value => value.isFile(), () => false);
  const executableReady = installed && await access(executable, constants.X_OK).then(() => true, () => false);
  return { executable, installed, executableReady };
}

export async function installDesktopHeadUnit(config: RuntimeConfig) {
  const result = await config.runner.run(config.sdkmanagerPath, [desktopHeadUnitPackage], { timeoutMs: 600_000 });
  if (result.code !== 0 || result.error) throw { code: "DHU_INSTALL_FAILED", message: result.stderr || result.error?.message || "Desktop Head Unit installation failed. Accept SDK licenses separately, then retry." };
  const executable = desktopHeadUnitPath(config);
  if (process.platform !== "win32") {
    const mode = (await stat(executable)).mode;
    await chmod(executable, mode | 0o100);
  }
  const status = await desktopHeadUnitStatus(config);
  if (!status.executableReady) throw { code: "DHU_NOT_EXECUTABLE", message: `Desktop Head Unit is not executable: ${executable}` };
  return status;
}

function validateSerial(serial: string) {
  if (!serial.trim() || serial.startsWith("-") || /[\s\x00]/.test(serial)) throw { code: "INVALID_ARGUMENT", message: "A nonblank ADB device serial is required." };
}

export async function runDesktopHeadUnit(config: RuntimeConfig, serial: string, signal?: AbortSignal) {
  validateSerial(serial);
  const status = await desktopHeadUnitStatus(config);
  if (!status.executableReady) throw { code: "DHU_NOT_INSTALLED", message: "Install the Android Auto Desktop Head Unit first. If already installed, make its binary executable." };
  const state = await config.runner.run(config.adbPath, ["-s", serial, "get-state"]);
  if (state.code !== 0 || state.stdout.trim() !== "device") throw { code: "DHU_DEVICE_UNAVAILABLE", message: state.stderr || "Selected device is offline or unauthorized." };
  if (signal?.aborted) return { serial, stopped: true };
  // ADB allocates a free port without replacing any existing forward.
  const forward = await config.runner.run(config.adbPath, ["-s", serial, "forward", "tcp:0", "tcp:5277"]);
  if (forward.code !== 0 || forward.error) throw { code: "DHU_FORWARD_FAILED", message: forward.stderr || "Could not forward the Android Auto head unit server." };
  const port = forward.stdout.trim();
  if (!/^[1-9]\d*$/.test(port) || Number(port) > 65535) throw { code: "DHU_FORWARD_FAILED", message: "ADB did not return the allocated forwarding port." };
  let failure: unknown;
  try {
    if (!signal?.aborted) {
      await new Promise<void>((resolve, reject) => {
        const child = config.runner.spawn(status.executable, [`--adb=127.0.0.1:${port}`], {
          cwd: dirname(status.executable), stdio: ["pipe", "pipe", "pipe"], shell: false,
        });
        let diagnostics = "";
        const append = (data: Buffer) => { diagnostics = (diagnostics + data.toString()).slice(-4000); };
        child.stdout?.on("data", append);
        child.stderr?.on("data", append);
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
          child.kill("SIGTERM");
          killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
        };
        const clean = () => { signal?.removeEventListener("abort", stop); if (killTimer) clearTimeout(killTimer); };
        child.once("error", (error: Error) => { clean(); reject(error); });
        child.once("close", (code: number | null) => {
          clean();
          if (code === 0 || signal?.aborted) resolve();
          else reject({ code: "DHU_LAUNCH_FAILED", message: `Desktop Head Unit exited (${code}). Start the head unit server in Android Auto developer settings and unlock the device. ${diagnostics}` });
        });
        signal?.addEventListener("abort", stop, { once: true });
        if (signal?.aborted) stop();
      });
    }
  } catch (error) { failure = error; }
  const cleanup = await config.runner.run(config.adbPath, ["-s", serial, "forward", "--remove", `tcp:${port}`]);
  if (cleanup.code !== 0 || cleanup.error) throw { code: "DHU_CLEANUP_FAILED", message: `Could not remove DHU forwarding port ${port}. ${cleanup.stderr} ${failure ? String((failure as { message?: string }).message ?? failure) : ""}` };
  if (failure) throw failure;
  return { serial, stopped: true };
}
