# ADBuddy catalog integration

The helper remains an optional separately installed Node package. ADBuddy should
invoke its CLI, validate the protocol envelope, and probe the catalog capabilities
before opening profile/image pickers. No Node runtime is bundled with ADBuddy.

## Existing Androperator source selection

Androperator implements this in
`apps/node/src/adapters/android-emulator/packageSource.ts` and imports the selected
library through `packageBackend.ts`. `ANDROPERATOR_EMULATOR_SOURCE` supports:

- `auto`: a development source checkout prefers its sibling `emulator` checkout;
  a packaged consumer uses its installed npm dependency.
- `local`: require a discoverable sibling checkout.
- `published`: use the consumer's installed `@androperator/emulator` dependency.
- An absolute package directory: explicitly select a built package checkout.

It validates package identity and the built entry point. An existing but unbuilt
local package produces an actionable error rather than silently using another
version. Sibling resolution handles Git worktrees through their common repository.
The published branch is npm module resolution, not discovery of a global CLI.

## Proposed native adaptation

ADBuddy can follow the same explicit-selection approach while using the CLI:

1. During development, allow an explicit package directory and the built sibling
   checkout. Resolve its `dist/cli.js` and validate its package identity.
2. For installed ADBuddy, discover the separately installed `androperator-emulator`
   CLI, with an explicit user override. Do not infer a development sibling from the
   installed app's bundle path.
3. Resolve Node 24+ and the SDK/Java environment explicitly. Finder launches may not
   inherit terminal PATH or version-manager setup; finding a CLI symlink alone
   does not guarantee its `env node` launcher will work.
4. Probe `--version`, check protocol 1 and `catalog.profiles` / `catalog.images`,
   and show the selected source/version in diagnostics. Source selection belongs
   to the consumer; the helper itself does not interpret the source variable.
5. Read `profiles` and `images --installed` first; query `images` when remote
   choices are requested. Supply the selected IDs unchanged to `create`.

This document records the integration boundary; native discovery and SwiftUI
creation controls are not implemented by this catalog change. Progress,
cancellation, compatibility recommendations and snapshot-free allocation remain
separate package enhancements. Do not present a total host-disk quota or claim
that a configured capacity resizes existing userdata.
