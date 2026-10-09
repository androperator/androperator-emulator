# @androperator/emulator

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
npm install -g ./androperator-emulator-0.2.0.tgz
androperator-emulator --version
```

Install the published CLI with `npm install -g @androperator/emulator`.
Consumers can also install the packed archive without this checkout or development
dependencies.
The executable remains `androperator-emulator`. See [provenance](docs/provenance.md)
for source history and [plan](docs/plan.md) for follow-on work.

## Homebrew installation

```sh
brew install androperator/tap/emulator
brew upgrade androperator/tap/emulator
```

The executable remains `androperator-emulator`. Homebrew manages Node and uses
this package's npm release archive. Android SDK tools and Java are configured
separately. When moving from a global npm installation, first remove it with
`npm uninstall -g @androperator/emulator` to avoid executable conflicts.
New versions become available after automatic tap validation; Homebrew can
hold newly published dependencies for 24 hours. Do not upgrade a Homebrew
installation using npm.

## CLI

```sh
androperator-emulator profiles
androperator-emulator images
androperator-emulator images --installed
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

### Creation catalogs

`profiles` returns `{profiles: [{id, name, manufacturer, tag}]}` from the SDK's
hardware definitions. Pass the stable `id` to `create --profile`; the SDK's
numeric row index is not returned. Missing manufacturer or tag values are null.

`images` queries installed and available SDK packages and returns
`{images: [{id, platform, apiLevel, tag, abi, description, installed,
installedVersion, availableVersion}]}`. `images --installed` queries only local
packages, so it does not require fetching the remote catalog. Pass `id` directly
to `create --image`. IDs use semicolons regardless of the SDK output format.
Versions remain strings; an absent installed or available version is null.
`platform` preserves the complete platform identifier, including minor versions
or preview names. `apiLevel` is the numeric major API for numeric platforms and
null for codenames. Results are sorted by ID, with each image appearing once.

These are catalogs, not compatibility recommendations. Callers must select a
suitable image/profile/host combination; do not assume every listed image runs
on this Mac. Remote queries can require network access and may take longer than
local queries. Tool or unrecognized-format failures return
`ANDROID_CATALOG_QUERY_FAILED`; empty recognized catalogs return empty arrays.
The legacy SDK table and the Android CLI shim's slash-separated table are supported.

Library consumers can call `listHardwareProfiles(config)` and
`listSystemImages(config, {installedOnly: true})`; omitting the latter option
includes available images. Neither command starts ADB or accepts licenses.
`--version` now includes `capabilities: ["catalog.profiles", "catalog.images"]`
in its data object. Consumers should treat missing capabilities as unsupported;
the JSON envelope remains protocol version 1. Earlier published versions lack
these catalog commands.

Create requires explicit image, hardware profile and storage capacity. Existing
AVDs are refused unless `--replace` is supplied, which discards existing data.
Replacement and deletion refuse running AVDs and fail closed if ADB discovery
fails or an emulator is offline/unauthorized. These are point-in-time checks;
callers must serialize concurrent lifecycle changes for the same AVD.

Installed-image detection accepts both the legacy semicolon-and-pipe table and
the Android CLI shim's slash-separated package IDs and whitespace columns.

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

## Agent skill

[Create Android Emulator](.agents/skills/create-android-emulator/SKILL.md) guides an
agent through image/profile discovery, creation with practical development
storage (24G by default), boot verification and actual guest storage checks using
this package. Invoke it as `$create-android-emulator`.

The source lives in `.agents/skills/create-android-emulator/`, the repository
skill location supported by Codex. The same folder is included in the npm
archive; the release-only skill is excluded. Installing the npm package does
not automatically register its skill with an agent.

To use it in another project, copy the entire skill folder from
`node_modules/@androperator/emulator/.agents/skills/create-android-emulator/`
into that project's `.agents/skills/`. For a global npm installation, the source
is under `$(npm root -g)/@androperator/emulator/.agents/skills/`. For personal
Codex use across projects, copy it into `~/.agents/skills/` instead. Copies should
be refreshed when upgrading the library.

Each skill needs a `SKILL.md` with name/description frontmatter and instructions;
`agents/openai.yaml` supplies optional UI metadata. Repository skills work well
for checked-in workflows. Plugins provide an installation unit for broader skill
distribution and optional connectors. See the official
[skill discovery and distribution guidance](https://learn.chatgpt.com/docs/build-skills).

## Library

```js
import { getDefaultRuntimeConfig, createAvd, listConfiguredAvds } from '@androperator/emulator';
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

## Tests and releases

GitHub Actions builds, tests and checks a packed installation on Linux and macOS.
See [releasing](docs/releasing.md) for the first publication and subsequent releases.
