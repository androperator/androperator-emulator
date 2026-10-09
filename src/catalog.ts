import type { RuntimeConfig } from "./runtimeConfig.js";
import { runAndroidSdkTool } from "./hostToolClient.js";

export interface HardwareProfile {
  /** Stable identifier accepted by create --profile; never the catalog row number. */
  id: string;
  name: string;
  manufacturer: string | null;
  tag: string | null;
}

export interface SystemImage {
  /** Canonical semicolon-delimited identifier accepted by create --image. */
  id: string;
  platform: string;
  apiLevel: number | null;
  tag: string;
  abi: string;
  description: string;
  installed: boolean;
  installedVersion: string | null;
  availableVersion: string | null;
}

function catalogError(message: string): never {
  throw { code: "ANDROID_CATALOG_QUERY_FAILED", message };
}

export function parseHardwareProfiles(output: string): HardwareProfile[] {
  const profiles: HardwareProfile[] = [];
  let profile: HardwareProfile | undefined;
  function finish(): void {
    if (!profile) return;
    if (!profile.name) catalogError(`Missing name for hardware profile ${profile.id}`);
    profiles.push(profile);
  }
  for (const line of output.split(/\r?\n/)) {
    const id = /^\s*id:\s*\d+\s+or\s+"([^"]+)"\s*$/.exec(line);
    if (id) {
      finish();
      profile = { id: id[1], name: "", manufacturer: null, tag: null };
    } else if (/^\s*id:/.test(line)) {
      catalogError(`Unrecognized hardware profile identifier: ${line.trim()}`);
    } else if (profile) {
      const field = /^\s*(Name|OEM|Tag)\s*:\s*(.*?)\s*$/.exec(line);
      if (field?.[1] === "Name") profile.name = field[2];
      if (field?.[1] === "OEM") profile.manufacturer = field[2] || null;
      if (field?.[1] === "Tag") profile.tag = field[2] || null;
    }
  }
  finish();
  if (!profiles.length && !output.includes("Available devices definitions:")) {
    catalogError("Unrecognized hardware profile catalog; expected avdmanager list device output");
  }
  return profiles.sort((a, b) => a.id.localeCompare(b.id));
}

export function parseSystemImages(output: string): SystemImage[] {
  const images = new Map<string, SystemImage>();
  let section: "installed" | "available" | undefined;
  let recognized = false;
  for (const line of output.split(/\r?\n/)) {
    const heading = /^\s*(Installed packages|Available Packages|Available packages|Available Updates|Available updates):\s*$/.exec(line);
    if (heading) {
      recognized = true;
      section = heading[1] === "Installed packages" ? "installed"
        : heading[1].toLowerCase() === "available packages" ? "available" : undefined;
      continue;
    }
    if (!/^\s*system-images[;/]/.test(line)) continue;
    // Update tables have a different schema; their rows are already represented
    // by the installed and available package sections.
    if (!section) continue;
    const columns = line.includes("|") ? line.split("|").map((column) => column.trim())
      : line.trim().split(/\s{2,}/);
    const [rawId, version, description] = columns;
    const id = rawId.replaceAll("/", ";");
    const parts = /^system-images;(android-[^;\s]+);([^;\s]+);([^;\s]+)$/.exec(id);
    if (!parts || !version || !description) catalogError(`Unrecognized system image row: ${line.trim()}`);
    const [, platform, tag, abi] = parts;
    const api = /^android-(\d+)(?:\.\d+)*$/.exec(platform);
    const image = images.get(id) ?? {
      id, platform, apiLevel: api ? Number(api[1]) : null, tag, abi, description,
      installed: false, installedVersion: null, availableVersion: null,
    };
    if (section === "installed") {
      image.installed = true;
      image.installedVersion = version;
    } else {
      image.availableVersion = version;
      image.description = description;
    }
    images.set(id, image);
  }
  if (!recognized) catalogError("Unrecognized system image catalog; expected sdkmanager package sections");
  return [...images.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listHardwareProfiles(config: RuntimeConfig): Promise<HardwareProfile[]> {
  const result = await runAndroidSdkTool(config, "avdmanager", ["list", "device"], { timeoutMs: 30_000 });
  if (result.code !== 0 || result.error) catalogError(result.stderr || result.error?.message || "Could not list hardware profiles");
  return parseHardwareProfiles(result.stdout);
}

export async function listSystemImages(
  config: RuntimeConfig,
  options: { installedOnly?: boolean } = {},
): Promise<SystemImage[]> {
  const result = await runAndroidSdkTool(config, "sdkmanager", [options.installedOnly ? "--list_installed" : "--list"], { timeoutMs: 120_000 });
  if (result.code !== 0 || result.error) catalogError(result.stderr || result.error?.message || "Could not list system images");
  const images = parseSystemImages(result.stdout);
  return options.installedOnly ? images.filter((image) => image.installed) : images;
}
