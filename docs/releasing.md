# Publishing @androperator/emulator

The npm package is `@androperator/emulator`; its executable is `androperator-emulator`.
Node.js 24+ is required. The Android SDK and Java are installed separately.

Agents can use the project [release-package skill](../.agents/skills/release-package/SKILL.md)
to prepare, publish, resume, or verify a release. Trusted Publishing was verified
with the automated `0.1.1` release; the bootstrap instructions below remain for reference.

## First publication

1. Merge the package and workflow setup into `main` and confirm GitHub tests pass.
2. From the clean release checkout, run `npm ci`, `npm run build`, and `npm test`.
3. Run `npm run release:pack -- /tmp/emulator-release.tgz`. This builds and checks
   archive contents, installs it in a temporary consumer, and checks the CLI and library.
4. Log in with `npm login` using an account with publishing rights in the
   `androperator` npm organization. Complete the account's 2FA requirements.
5. Publish the validated archive with
   `npm publish /tmp/emulator-release.tgz --ignore-scripts --access public`.
6. In the package's npm settings, add a GitHub Actions Trusted Publisher:
   organization/user `androperator`, repository `androperator-emulator`, workflow
   filename `publish-npm.yml`, no environment name. Enable direct `npm publish`.

No CI npm token is needed. Trusted Publishing requires npm 11.5.1+ and a
GitHub-hosted runner. See the [npm documentation](https://docs.npmjs.com/trusted-publishers/).
Verify the first release with `npm view @androperator/emulator version`.
The first version is published manually. Do not trigger the publishing workflow
for that same version; start automated tag releases with the next version.

## Subsequent releases

1. Update the version using `npm version patch --no-git-tag-version` (or `minor` / `major`).
2. Document the release changes, run the build, tests and `npm run release:pack`,
   and merge the release changes into `main` through a pull request.
3. Tag the merged release commit `vX.Y.Z` and push that tag to origin.
4. Check the Publish npm Package workflow and verify the version on npm.

The workflow checks that the stable release tag matches `package.json`, builds,
tests, validates the installed archive and publishes that exact archive using OIDC.
To retry a failed publication, manually run `publish-npm.yml` with the existing tag.
Published versions cannot be overwritten; retries are for versions not yet published.

The main Androperator project currently bundles the earlier unscoped dependency.
Migrating it to `@androperator/emulator` is a separate consumer change.

## Homebrew

[androperator/homebrew-tap](https://github.com/androperator/homebrew-tap) provides
`brew install androperator/tap/emulator` using the same npm archive. Its hourly
workflow checks npm `latest`, verifies archives, tests candidate installations,
and commits formula updates automatically. No separate application build,
publication account, or cross-repository token is needed.

After verifying an npm release, the release-package skill requests an immediate
check using `gh workflow run update.yml --repo androperator/homebrew-tap --ref main`.
A failed dispatch is deferred to the hourly schedule. Dispatch success is not
publication proof: check the workflow conclusion and committed
`Formula/emulator.rb` version. Homebrew can defer dependencies published in the
previous 24 hours. Retry the tap workflow without recreating the npm release.
