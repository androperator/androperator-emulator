import { ERROR_CODES } from "./errors.js";

export function validateAvdName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    throw { code: ERROR_CODES.ANDROID_AVD_CREATE_FAILED, message: "AVD name must start with a letter or number and contain only letters, numbers, dots, underscores or hyphens", details: { name } };
  }
}

export function validateSystemImage(systemImage: string): void {
  if (!/^system-images;android-[A-Za-z0-9_.-]+;[A-Za-z0-9_.-]+;[A-Za-z0-9_.-]+$/.test(systemImage)) {
    throw { code: ERROR_CODES.INVALID_ARGUMENT, message: "Use a system image package ID, for example system-images;android-35;google_apis;arm64-v8a", details: { systemImage } };
  }
}
