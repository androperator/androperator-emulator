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

1. **Extraction and independent package** (in progress): port SDK/process,
   configured/running AVD and lifecycle mechanics with corresponding tests;
   implement minimal independent runtime config, typed library exports and
   versioned JSON CLI. Document source mapping, changed defaults, safe replacement,
   license acceptance and AVD locations. Build, test, pack and smoke-test installation.
   Run task cleanup (no task pack), simplify-code and fresh Astra review loop to clean.
2. **Androperator migration and validation** (pending): use shared library behind
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
| `test/unit/emulatorProvision.test.ts`, `emulatorCli.test.ts` | Retain as consumer integration regressions; add standalone CLI boundary checks |

## Evidence and remaining work

- Initial source inventory verified against the baseline above.
- Phase 1 implementation built successfully; 25 tests pass, including ported
  mechanics and new boundary/CLI checks. Packed install exposes the CLI and library.
- Cleanup: no task pack to retire. Simplification removed policy coupling, shell
  execution and unnecessary discovery typing. Fresh Astra review pending.
- Phase 2 migration and consumer validation pending.
- Follow-on: hardware/image catalogs, host-aware selection, streaming/cancellation,
  dynamic storage/snapshot policy, ADBuddy discovery and native UI.
