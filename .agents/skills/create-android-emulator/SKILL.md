---
name: create-android-emulator
description: Create or recreate an Android development emulator with the @androperator/emulator library or CLI, choose an installed phone image and profile, configure practical storage, and verify boot and guest capacity. Use for local AVD provisioning, including insufficient storage during repeated APK installs.
---

# Create Android Emulator

Use `@androperator/emulator` for AVD lifecycle operations. Prefer its JSON CLI for
interactive provisioning; use the library exports when integrating into code.
This skill creates a device, not an Android UI automation workflow.

## Discover and choose

Find an installed `androperator-emulator` and check `--version` and `--help`.
In this library's source checkout, use `npm ci` if dependencies are missing,
`npm run build`, then `node dist/cli.js` as the CLI. Outside the checkout, use
`npm install -g @androperator/emulator` when installation is within the request.
Requires Node.js 24+, Android SDK tools and their Java runtime. Missing SDK or
Java prerequisites should be reported before provisioning; the package does not
install the SDK itself.

CLI tool overrides are `ADB_PATH`, `EMULATOR_PATH`, `SDKMANAGER_PATH` and
`AVDMANAGER_PATH`. Otherwise discovery checks `ANDROID_HOME`, `ANDROID_SDK_ROOT`,
standard macOS/Linux SDK roots, then PATH. Use the same resolved tools for the SDK
and adb commands below. Keep `ANDROID_AVD_HOME` consistent across all commands
if set; other custom Android home conventions are not supported by the library.

Inspect before mutating:

```sh
androperator-emulator list
androperator-emulator status
"$sdkmanager" --list_installed
"$avdmanager" list device -c
```

Here `$sdkmanager`, `$avdmanager` and later `$adb` stand for the resolved executable
paths. The CLI has no image/profile enumeration command, so use SDK tools for
those read-only queries.

Respect requested API, image, profile, storage and name. Otherwise prefer:

- Name: `Android_Dev_API_<api>`.
- Data capacity: `24G`, for repeated development APK installs.
- Image: highest installed stable API with a Google Play phone image matching
  the host architecture (`arm64-v8a` on ARM, `x86_64` on x86).
- Profile: newest installed Pixel phone profile compatible with that image.

Use actual package and profile IDs from discovery, not guessed IDs. If no suitable
Google Play image is installed, choose an installed compatible Google APIs phone
image when Play Store access is unnecessary. If an image must be downloaded,
query `"$sdkmanager" --list` and choose an available compatible package. Creation
installs a missing selected image. `--accept-licenses` accepts **all outstanding
SDK licenses**, so use it only with explicit authorization for that acceptance.

## Create and boot

Set `$name`, `$image` and `$profile` to the selected values. For a fresh device:

```sh
androperator-emulator create "$name" \
  --image "$image" --profile "$profile" --storage-size 24G
androperator-emulator inspect "$name"
androperator-emulator start "$name" --headless
```

Substitute the requested capacity for `24G`. Omit `--headless` for a visible
emulator. Every CLI invocation returns one JSON envelope; check exit status and
`ok` before using `data`. Stop on failure, inspect the error and relevant state,
and retry only after addressing its cause. A failed start can leave an emulator
running; check `status` before launching again.

Existing names are refused. Reuse a suitable existing device or choose a fresh
name. Use `create --replace` only when the user has authorized discarding that
AVD's data. Before replacement, stop the target if running, then poll `status`
with a bounded timeout to confirm its serial disappears. `stop` only requests
shutdown. Replacement/deletion refuse running AVDs and fail closed on uncertain
ADB state; resolve that state instead of bypassing the checks. Serialize lifecycle
operations for the same AVD.

`storage` changes configured capacity only; it does not resize existing userdata.
Prefer a fresh AVD for a capacity change. Creation does not configure an SD card,
force qcow2 allocation, or disable snapshot saving. Do not promise the reference
AVD workflow's sparse disk or snapshot-free behavior. CLI launch disables snapshot
loading. If snapshot saving must be disabled, use library `startAvd` with
`["-no-snapshot-save"]`, then both readiness waits described below.

## Verify and report

Successful CLI `start` returns `data.serial` and `booted: true` after registration
and both boot properties pass. Use that returned serial, never assume port 5554.
If reusing an already-running target, resolve its serial by AVD name in `status`
and use `wait <serial>` to verify readiness.

```sh
"$adb" -s "$serial" shell df -h /data
```

Check actual total and free guest capacity against the requested size; `inspect`
reports device metadata, not storage capacity. If an APK is supplied for a smoke
test, install it on this serial with `"$adb" -s "$serial" install -r "$apk"`.
If host disk usage matters, obtain the actual config path with library
`getAvdConfigPath(name)` (AVD locator files may redirect it), and measure its
parent directory with `du -sh`. Inspect existing userdata with SDK `qemu-img info`
only when that tool and file exist; report measured allocation rather than
assuming qcow2 or a small physical size.

Leave a requested development device running. Stop a device launched only for
verification when the requested outcome does not require it running; confirm
shutdown before reporting it stopped. Do not delete the created AVD as cleanup.
Report name, API/image/profile, configured capacity, measured `/data` total/free,
serial and boot state, APK result if tested, and the normal launch command.
Distinguish unavailable measurements from verified results.

## Library integration

The root export supplies `getDefaultRuntimeConfig`, `createAvd`,
`inspectConfiguredAvd`, `listRunningEmulators`, `startAvd`,
`waitForEmulatorRegistration`, `waitForBootCompletion`, `stopAvd`, and
`getAvdConfigPath`. Use the same selections and replacement/license boundaries.

```js
import {
  getDefaultRuntimeConfig, createAvd, startAvd,
  waitForEmulatorRegistration, waitForBootCompletion,
} from '@androperator/emulator';

const config = getDefaultRuntimeConfig();
await createAvd(config, {
  name, systemImage: image, deviceProfile: profile, dataPartitionSize: '24G',
});
await startAvd(config, name, ['-no-window', '-no-audio']);
const serial = await waitForEmulatorRegistration(config, name);
await waitForBootCompletion(config, serial);
```

`startAvd` confirms spawn only; both waits are required to confirm readiness.
