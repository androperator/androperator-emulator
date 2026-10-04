# Extraction provenance

Source: `https://github.com/androperator/androperator`, revision
`43210a51315ad9e0badd80311bf686596a46b154`. Source license: Apache-2.0, retained
in `LICENSE`; attribution retained in `NOTICE`. This is primarily ported code.

Paths in the first column are relative to the source `apps/node/src/`.

| Original module/test | Destination | Adaptation |
| --- | --- | --- |
| `domain/android-emulators/configuredAvds.ts` | `src/configuredAvds.ts` | Remove support policy; validate names; follow locator paths; propagate read errors; recognize empty locator files |
| `domain/android-emulators/runningEmulators.ts` | `src/runningEmulators.ts` | Remove support annotation; retain serial/name and both boot-property checks |
| `domain/android-emulators/lifecycle.ts` | `src/lifecycle.ts` | Explicit inputs/license/replacement policy; early size validation; exact image matching; async launch errors; fail-closed delete/replacement |
| `domain/android-emulators/hostRequirements.ts` | `src/hostRequirements.ts` | Generic runtime/error imports |
| `domain/android-emulators/constants.ts`, `types.ts` | `src/constants.ts`, `src/types.ts` | Keep only timing/size mechanics and generic metadata |
| `adapters/android-sdk/hostToolClient.ts` | `src/hostToolClient.ts` | Generic imports |
| `adapters/android-bridge/processRunner.ts` | `src/processRunner.ts` | Remove shell execution; handle stdin closure; kill timed-out SDK process and report timeout |
| `adapters/android-bridge/adbClient.ts`, `domain/devices/listDevices.ts` | `src/adbClient.ts` | Preserve serial selection; inject consumer logging; check failed/malformed device discovery |
| `adapters/android-bridge/runtimeConfig.ts` | `src/runtimeConfig.ts` | New minimal runtime contract and SDK discovery adapted from source |
| `contracts/errors.ts` | `src/errors.ts` | Retain emulator error strings; add boundary errors |
| `cli/commands/emulator.ts` | `src/cli.ts` | New parser and versioned JSON envelope; orchestration adapted from source |
| `test/unit/configuredAvds.test.ts` | `src/test/configuredAvds.test.ts` | Port parsing/discovery checks; remove consumer compatibility assertions |
| `test/unit/runningEmulators.test.ts` | `src/test/runningEmulators.test.ts` | Port console, boot and serial checks; remove compatibility assertions |
| `test/unit/emulatorLifecycle.test.ts` | `src/test/emulatorLifecycle.test.ts` | Port creation/storage/cleanup/start/wait/stop/delete checks with explicit inputs; developer-settings test remains in consumer |
| `test/unit/androidEmulatorsFoundation.test.ts` | `src/test/androidEmulatorsFoundation.test.ts` | Port tool availability tests; defaults tests remain in consumer |
| `test/unit/fakes/FakeProcessRunner.ts` | `src/test/fakes/FakeProcessRunner.ts` | Port deterministic runner |
| No source equivalent | `src/test/boundaries.test.ts` | New boundary, process-error and CLI protocol checks |

`compatibility.ts`, `provision.ts`, defaults, default-name generation and guest
developer settings remain Androperator policy. Its `emulatorCli.test.ts` and
`emulatorProvision.test.ts` stay in the consumer as integration regressions.

## Intentional corrections and limits

- Generic creation never silently replaces data or accepts licenses. The consumer
  can explicitly retain its former policy. Replacement refuses a running target.
- Invalid capacity fails before SDK mutation. Failed post-create configuration
  still attempts cleanup only for a newly created AVD, as in the source.
- Installed-image matching uses the exact package column instead of substring
  matching. No remote image catalog or recommendation algorithm was added.
- Config paths follow AVD metadata instead of assuming `<name>.avd` always owns
  the data. Unexpected filesystem errors are no longer silently treated as absent.
- ADB query errors and offline emulators cannot be interpreted as safe deletion.
- Start reports asynchronous spawn failure; callers must await it. Process timeout
  is reported even if a child exits successfully after the deadline.
- Storage configuration remains virtual capacity only. No host disk cap, resizing,
  qcow2 conversion, cancellation or snapshot-save policy is claimed.
