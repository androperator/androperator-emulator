---
name: release-package
description: Prepare, publish, resume, or verify an @androperator/emulator npm release through this repository's PR checks and GitHub Trusted Publishing.
---

# Release @androperator/emulator

Resume from the first incomplete stage using the requested version. Preparation
or verification alone does not authorize merging or publication. An explicit
request to complete a release authorizes its PR merge and release tag push.

## Contracts

- Repository: `androperator/androperator-emulator`.
- Package: `@androperator/emulator`; executable: `androperator-emulator`.
- Version: root `package.json`, root lockfile version and `packages[""].version`.
  The CLI reads the installed manifest; no separate source constant needs a bump.
- Stable tag: `vX.Y.Z`, matching the manifest exactly.
- Publisher: `.github/workflows/publish-npm.yml`, GitHub-hosted Ubuntu and npm
  OIDC. No `NPM_TOKEN` or local npm login is needed for normal releases. npm
  trusts this exact repository and workflow, allows direct `npm publish`, and
  has no environment name configured.
- Main requires `test (ubuntu-latest)` and `test (macos-latest)`; squash merges only.
- No APK, website badge, download endpoint or GitHub Release is required here.

## Prepare

1. Inspect the working tree, preserve unrelated changes, fetch `origin/main`,
   and create a release branch from it.
2. Establish the stable version. If unspecified, infer the next patch from the
   manifest and npm state; resolve ambiguity before editing. Check
   `npm view @androperator/emulator versions --json` and local/remote tags.
   Auth or network failures do not prove a version is unpublished.
3. Update manifest and lockfile together using
   `npm version <version> --no-git-tag-version`. Add exactly one CHANGELOG entry
   grounded in changes since the previous release commit. Inspect README's
   packed-install example. Distinguish source-build version examples from claims
   that a new version is already published.
4. Run `npm ci`, `npm run build`, `npm test`, and
   `RELEASE_TAG=v<version> npm run release:pack`. The pack validator builds,
   checks contents, and probes an installed CLI and library in a temporary
   consumer. The process-cleanup test needs `ps` access; do not weaken it to
   bypass a sandbox restriction.
5. Commit and open/update a PR using `pr-create` when available, otherwise `gh`
   with clean-branch and current-main checks. Follow the requested review
   workflow and wait for both required CI checks.

## Publish

1. With release authorization, squash-merge the reviewed PR and verify its
   merged SHA with `gh pr view`. Respect the merge skill's review requirements.
   Never push directly to main.
2. Fetch the merged commit and verify its manifest and lockfile match the target.
   Recheck that the npm version is unpublished and the tag absent locally and
   remotely. Never overwrite a tag.
3. Create an annotated `v<version>` tag on that exact merged SHA and push only
   that tag. This triggers publication; do not also publish manually.
4. Find the `publish-npm.yml` run for the tag and SHA with `gh run list` and
   watch it to completion. Missing runs, failures and timeouts are unfinished
   publication. Report the run URL and failing step.

## Verify and close

- Confirm the remote tag resolves to the merged SHA and its publish run succeeded.
  Check `npm view @androperator/emulator@<version> version` and
  `npm view @androperator/emulator dist-tags --json --prefer-online`.
  Stable publication must leave `latest` equal to the target.
- npm may accept a publication while still processing it. Retry verification
  briefly with progress updates; never republish while processing. Report
  unresolved availability separately from workflow failure and resume later.
- If installed behavior needs checking, install the registry version into a
  temporary consumer and probe `--version`, `--help`, and the library import.
  Do not replace the user's global install without authorization.
- Update public version claims only after publication is verified. No separate
  published-version commit is necessary when README uses an unversioned npm
  command and its source-build archive example matches the manifest. Any needed
  public version update goes through a separate PR.
- Leave the code version at the released version unless a next development
  version was requested; no automatic post-release bump is required.
- Report version, merged SHA, tag, PR/run URLs and registry verification, plus
  unfinished stages. Saved npm settings alone do not prove OIDC works.

## Recovery

Inspect tag, workflow logs and npm before retrying. For an existing unchanged
release tag with an unpublished version, investigate the failure, then use the
workflow's manual `release_tag` dispatch within existing release authorization.
If a fix needs a new commit, use a new version/tag rather than moving the old tag.
Published versions cannot be overwritten.

Bootstrap instructions are in
[docs/releasing.md](../../../docs/releasing.md). The npm organization and Trusted
Publisher were configured and verified by the successful `0.1.1` OIDC release.
