# androperator-emulator

Android SDK emulator lifecycle library and JSON CLI, extracted from Androperator.
Requires Node.js 24+, Android SDK tools (`adb`, `emulator`, `sdkmanager`,
`avdmanager`) and the Java runtime required by your SDK tools. macOS and Linux
are the initial targets. No Node runtime or native ADBuddy UI is bundled.

## Build and install locally

```sh
npm ci
npm run build
npm test
npm pack
npm install -g ./androperator-emulator-0.1.0.tgz
androperator-emulator --version
```

The package is not yet published. Consumers can install the packed archive without
this checkout or development dependencies. See [provenance](docs/provenance.md)
for source history and [plan](docs/plan.md) for follow-on work.

## CLI

```sh
androperator-emulator list
androperator-emulator inspect My_AVD
androperator-emulator status
androperator-emulator download 'system-images;android-35;google_apis;arm64-v8a'
androperator-emulator create My_AVD \
  --image 'system-images;android-35;google_apis;arm64-v8a' \
  --profile pixel_7 --storage-size 12G
androperator-emulator start My_AVD --headless
androperator-emulator wait emulator-5554 --timeout-ms 180000
androperator-emulator stop My_AVD
androperator-emulator delete My_AVD
```

`--help` describes all commands. `--json` or `--output json` can appear before or
after a command; JSON is always the default. Each invocation writes exactly one
JSON document on stdout. SDK output is captured, not mixed into the response.
Exit codes: 0 success, 1 operation failure, 2 invalid command arguments.

```json
{"protocolVersion":1,"ok":true,"data":{"devices":[]}}
```

Failures have `ok: false` and `error: {code, message, details?}` instead of `data`.
The `--version` response identifies the package and machine protocol without SDK
access. ADBuddy can probe this command after finding the separately installed
executable; native discovery and installation UI are separate work.

Create requires explicit image, hardware profile and storage capacity. Existing
AVDs are refused unless `--replace` is supplied, which discards existing data.
Replacement and deletion refuse running AVDs and fail closed if ADB discovery
fails or an emulator is offline/unauthorized. These are point-in-time checks;
callers must serialize concurrent lifecycle changes for the same AVD.

Downloads do not automatically accept SDK licenses. Add `--accept-licenses` to
`download` or `create` only to authorize `sdkmanager --licenses` acceptance for
all outstanding SDK licenses. Otherwise licenses must already be accepted.

`start` waits for registration (60 seconds) and both Android boot properties
(180 seconds). `stop` requests emulator shutdown; it does not wait for process
exit. Launch disables snapshot loading, but does not disable snapshot saving.
It does not change guest developer settings.

`storage <name> --storage-size 24G` updates the configured `/data` capacity only.
It does not resize existing userdata, guarantee free space, or impose a host disk
quota. Use a fresh AVD when changing capacity. Dynamic qcow2 allocation and
snapshot-free storage are follow-on capabilities.

## Library

```js
import { getDefaultRuntimeConfig, createAvd, listConfiguredAvds } from 'androperator-emulator';
const config = getDefaultRuntimeConfig();
await createAvd(config, {
  name: 'My_AVD',
  systemImage: 'system-images;android-35;google_apis;arm64-v8a',
  deviceProfile: 'pixel_7',
  dataPartitionSize: '12G',
});
console.log(await listConfiguredAvds(config));
```

The root export includes inspection, running discovery, installation, creation,
storage configuration, start/stop/delete, registration/boot waits, host-tool
checks and process/runtime contracts. `startAvd` is asynchronous and confirms
spawn only; use the wait functions to confirm readiness. SDK operation failures
use `{code, message, details?}`; filesystem and process errors may be native
Errors. Inject a `ProcessRunner` for tests or an `adb` callback for consumer
logging. The library contains no Androperator compatibility or provisioning policy.

Explicit runtime paths override defaults. CLI environment overrides are
`ADB_PATH`, `EMULATOR_PATH`, `SDKMANAGER_PATH`, `AVDMANAGER_PATH`. Discovery checks
`ANDROID_HOME`, `ANDROID_SDK_ROOT`, standard macOS/Linux SDK roots, then PATH.
AVDs use `ANDROID_AVD_HOME` or `~/.android/avd`; locator `.ini` entries with
`path` or `path.rel` can redirect each AVD's config. Other Android home conventions
are not yet supported. Export `ANDROID_AVD_HOME` consistently for those setups.
