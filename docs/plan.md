# Port Androperator emulator

## Objective and constraints

Extract reusable Android SDK emulator mechanics from
[Androperator revision 43210a51315ad9e0badd80311bf686596a46b154](https://github.com/androperator/androperator/commit/43210a51315ad9e0badd80311bf686596a46b154)
into the independently installable
`androperator-emulator` Node library and CLI. Migrate Androperator to the library
while retaining its compatibility, defaults, provisioning, developer settings,
logging and output contracts. One primary implementation agent; fresh read-only
Astra reviewers at each phase close. Local commits only, no pushes or publishing.

Source baseline: `androperator/androperator` revision
`43210a51315ad9e0badd80311bf686596a46b154`. Both working trees were clean;
the destination had no commits.

## Verified capability inventory

| Capability | Source evidence and disposition |
| --- | --- |
| List and inspect configured emulators | Port `configuredAvds.ts`; remove compatibility policy |
| Identify running emulators | Port `runningEmulators.ts` and minimal ADB device parsing |
| Download a specified system image | Port `lifecycle.ts` SDK installation functions |
| Create an AVD from image and hardware profile | Port `lifecycle.ts` with explicit generic inputs |
| Set internal-storage capacity | Port normalization and config update from `lifecycle.ts` |
| Start, stop, wait for boot | Port `lifecycle.ts`; retain both boot properties |
| Delete with running-device check | Port `lifecycle.ts` |
| Reuse an emulator suitable for Androperator | Keep `provision.ts`, `compatibility.ts`, defaults and developer settings in consumer |
| Browse hardware profiles and downloadable images | Follow-on catalog phase; only installed-image query exists today |
| Filter compatible images and suggest one | Follow-on selection phase; existing compatibility is Androperator-specific |
| Download progress and cancellation | Follow-on process/API extension; existing process support buffers output and has timeouts |
| Dynamic allocation and snapshot-free storage | Follow-on storage phase; source sets capacity and launches with no snapshot load, but does not disable saves |
| ADBuddy creation UI and optional-package discovery | Separate consumer integration; no native UI in this task |

Virtual `/data` capacity is not a cap on total host disk use. Storage follow-on must
verify qcow2 allocation, snapshots and actual guest capacity on a disposable AVD;
changing config does not resize an existing disk. The existing SDK tools remain
supported; migration to a newer Android CLI is not a prerequisite.

## Phases

1. **Extraction and independent package** (complete): port SDK/process,
   configured/running AVD and lifecycle mechanics with corresponding tests;
   implement minimal independent runtime config, typed library exports and
   versioned JSON CLI. Document source mapping, changed defaults, safe replacement,
   license acceptance and AVD locations. Build, test, pack and smoke-test installation.
   Run task cleanup (no task pack), simplify-code and fresh Astra review loop to clean.
2. **Androperator migration and validation** (complete): use shared library behind
   consumer adapters; preserve public compatibility fields, defaults, provisioning,
   developer settings, logging and envelopes. Use a committed local package artifact
   until publication is separately authorized so clean installs remain reproducible.
   Run full consumer Node build/tests and focused integration checks. Close with
   cleanup, simplification and fresh Astra review loop to clean. Commit all task work.

At each phase close, update this plan with evidence and
remaining work. The requested review workflow's push and PR stages are excluded
by the explicit local-only constraint. No time estimates.

## Module and test mapping

Source paths below are relative to `apps/node/src/`; destination paths are relative
to this repository. A detailed final mapping belongs in `docs/provenance.md`.

| Source | Destination / disposition |
| --- | --- |
| `domain/android-emulators/configuredAvds.ts` | `src/configuredAvds.ts` |
| `domain/android-emulators/runningEmulators.ts` | `src/runningEmulators.ts` |
| `domain/android-emulators/lifecycle.ts` | `src/lifecycle.ts`; consumer keeps naming/defaults/developer settings |
| `domain/android-emulators/hostRequirements.ts` | `src/hostRequirements.ts` |
| `adapters/android-sdk/hostToolClient.ts` | `src/hostToolClient.ts` |
| `adapters/android-bridge/processRunner.ts` | `src/processRunner.ts` (non-shell subset) |
| `adapters/android-bridge/runtimeConfig.ts`, `adbClient.ts`; `domain/devices/listDevices.ts` | Minimal generic runtime/ADB boundary; consumer supplies its logged runner |
| `domain/android-emulators/types.ts`, `constants.ts` | Generic contracts/timing constants only; policy stays in consumer |
| `cli/commands/emulator.ts` | New standalone `src/cli.ts` adapted from command orchestration; consumer keeps envelope |
| `test/unit/configuredAvds.test.ts`, `runningEmulators.test.ts`, `emulatorLifecycle.test.ts` | Port relevant mechanics into `src/test/`; retain consumer policy checks |
| `test/unit/androidEmulatorsFoundation.test.ts` | Port host-tool checks; compatibility checks stay in consumer |
| `test/unit/emulatorProvision.test.ts`, `emulatorCli.test.ts` | Retained consumer integration regressions; standalone CLI boundary checks added |
| `cli/commands/serve.ts` | Consumer retains HTTP envelope; awaits asynchronous shared launch |
| No original equivalent | Consumer `test/integration/emulatorServe.test.ts` covers launch failure and continued server availability; `runningEmulators.test.ts` adds logging/serial-boundary coverage |

## Evidence and remaining work

- Initial source inventory verified against the baseline above.
- Phase 1 implementation built successfully; 27 tests pass, including ported
  mechanics and new boundary/CLI checks. Packed install exposes the CLI and library.
- Cleanup: no task pack to retire. Simplification removed policy coupling, shell
  execution and unnecessary discovery typing. First Astra pass found skipped-install and timeout-descendant bugs; repaired
  with regression coverage. Second fresh pass: no material issues found at
  `14575f719ea011e222327a653b7022c373e995ea`. The process-tree regression
  requires unrestricted `ps`; all 27 tests passed in that run.
- Live CLI list/status succeeded on the host. A disposable AVD was created from
  an installed API 35 Google APIs ARM64 image with Pixel 7 profile, booted,
  stopped and deleted. No downloads or license acceptance were needed. Requested
  config capacity was 4G; the image reported 5.8G guest capacity, demonstrating
  why config is not a host disk quota or a guaranteed resized partition.
- Phase 2 adapters now retain policy and logging while importing library mechanics.
  Final consumer build/test: 1,436 passed. The docs pipeline passed route checks
  without organization warnings. A packed consumer installed cleanly with its
  bundled library; the normal help and live status contracts were preserved.
  Consumer simplification replaced duplicated SDK/process mechanics with direct
  imports and narrow policy/logging adapters. No task pack needed cleanup.
  First integration review found one missing await in the HTTP start route;
  fixed with an HTTP spawn-failure regression. The second fresh pass found no
  material issues at consumer `044bd5487641de2d571b8a340b2937f65f348c36`
  and extraction `fbc1d38fd19556c1c086f32204285de97672b56b`.
- Consumer commits: `ba684b010612190c3cd6b88a4011466ddbcf99af` (migration),
  `044bd5487641de2d571b8a340b2937f65f348c36` (HTTP launch handling).
  Library implementation commits: `cfb8b1aebf040c0c9ddd4d37e574a85b55a28870`
  (extraction) and `14575f719ea011e222327a653b7022c373e995ea` (review repairs).
- The consumer uses an unpacked generated package snapshot, normal `npm ci`
  with `install-links=true`, and `bundleDependencies` for packed distribution.
  Clean installation and packed-install smoke checks passed with lifecycle
  scripts enabled. All 33 snapshot files match the extraction build/metadata.
- No implementation blockers remain. No pushes or package publication occurred.
  Live validation used installed images; network download/license acceptance
  paths were verified with process fixtures, not a live download.

## Deferred follow-on phases

These are separate capabilities, not prerequisites for the completed extraction.

3. **Catalog and selection:** SDK hardware profiles and installed/downloadable system
   images are now exposed by `profiles`, `images`, and matching library APIs.
   Explicit host/ABI/API filtering and deterministic suggestions remain follow-on work.
   Keep Androperator compatibility requirements in its consumer. Verify parsers
   against SDK output fixtures and available host architectures.
4. **Download progress and cancellation:** extend the runner and library with
   progress events and cancellation, then version the CLI machine contract as
   needed. Verify descendant cleanup and truthful incomplete-install results.
5. **Dynamic storage and snapshot policy:** add opt-in qcow2 and snapshot-free
   configuration. Verify a fresh AVD with guest `df`, `qemu-img info` and host
   allocation measurements. Capacity is not a hard host-disk limit; existing
   userdata resizing requires a separate deliberate migration policy.
6. **ADBuddy consumer integration:** discover the optional separately installed
   CLI, check its protocol/version, and build the native creation UI against its
   structured contract. Node is not bundled with ADBuddy. UI implementation is
   outside this extraction task.

## Catalog extension validation

- Added `profiles` and `images [--installed]`, matching library APIs, and additive
  catalog capability flags in the version response. These are new catalog
  features built on the extracted SDK process boundary, not a reimplementation
  of creation or download behavior.
- Build and all 34 tests passed, including legacy/shim catalog formats, installed
  and available version merging, strict CLI arguments, structured failures, and
  existing lifecycle regressions.
- Live read-only queries returned 96 hardware profiles, 329 system images across
  installed/available catalogs, and 8 installed images. The TV profile and API 36
  ARM64 TV image returned IDs suitable for the existing creation API.
- No emulator was created, deleted, or started by these checks. The SDK queried
  remote catalog metadata; no system image was installed.
- Native source selection guidance is recorded in `adbuddy-integration.md`, based
  on Androperator's current local/published package resolver.
