export interface ConfiguredAvd {
  name: string;
  exists: boolean;
  running: boolean;
  apiLevel: number | null;
  abi: string | null;
  playStore: boolean;
  deviceProfile: string | null;
  systemImage: string | null;
}

export interface RunningEmulator {
  type: "emulator";
  avdName: string;
  serial: string;
  booted: boolean;
}

