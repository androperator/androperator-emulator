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
   and create a release branch from it. When resuming, inspect existing release
   PRs, tags and runs first; reuse the matching state rather than repeating
   completed stages.
2. Establish and sanity-check the version before editing, opening a release PR,
   merging, or pushing a tag:
   - Read the manifest, npm's latest stable publication and local/remote tags.
     Use the current release baseline, not a historical example in this skill.
     Resolve conflicting version state before selecting a target. Auth or network
     failures do not prove a version is unpublished.
   - Require an explicit stable `X.Y.Z` version (an optional leading `v` is fine).
     Do not silently expand shorthand such as `2.0` to `2.0.0`; ask the user for
     the intended full version. If unspecified, infer the next patch only after
     establishing the baseline.
   - Routine bumps within the current major version are the next patch or the
     next minor with patch reset: `0.1.1 -> 0.1.2` and `0.1.1 -> 0.2.0` can
     proceed under existing release authorization.
   - Any major-version increase, skipped patch/minor sequence, downgrade, or
     version below an already published stable release requires explicit user
     confirmation of the exact target and baseline. For example, `0.1.1 ->
     2.0.0` is unusual even if syntactically valid. Explain the jump and ask
     whether it was intended; a bare release request with that number does not
     count as confirmation of the unusual jump. A prior explicit acknowledgment
     of this exact jump is sufficient; do not ask again.
   - An existing published target is not available for a new release. Treat it
     as verification/resume work, not as permission to overwrite it, regardless
     of confirmation. Recheck availability before tagging.
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
2. Fetch the merged commit and read its manifest and lockfile directly with
   `git show <merged-sha>:<path>`, rather than relying on whichever checkout a
   merge tool leaves active. Verify all three version fields match the target.
   Recheck that the npm version is unpublished and the tag absent locally and
   remotely. Never overwrite a tag.
3. Create an annotated `v<version>` tag on that exact merged SHA and push only
   that tag. This triggers publication; do not also publish manually.
4. Find the `publish-npm.yml` run for the tag and SHA with `gh run list` and
   watch it to completion. Missing runs, failures and timeouts are unfinished
   publication. Report the run URL and failing step.

## Verify and close

- Confirm the remote annotated tag's peeled commit equals the merged SHA and
  inspect the publish run for that tag and SHA. Record separately: workflow
  acceptance, registry metadata, and installable package availability.
- Check `npm view @androperator/emulator@<version> version --prefer-online` and
  `npm view @androperator/emulator dist-tags --json --prefer-online`.
  Stable publication must leave `latest` equal to the target. Then install that
  exact registry version into a temporary consumer and probe `--version`,
  `--help`, and the library import. This confirms the tarball is available,
  unlike the pre-release pack check or registry metadata alone. Keep the user's
  global installation unchanged and remove temporary consumers afterward.
- npm can report successful acceptance while processing the package. Read the
  publish log if metadata or tarball returns 404. Retry metadata/install checks
  at roughly 30-second intervals for up to five minutes after acceptance, with
  progress updates. Do not republish during processing. If still unavailable,
  report publication accepted but verification pending, with run URL and exact
  failing check; resume verification later. Other failures need diagnosis, not
  repeated publication or an automatic version bump.
- Once registry installation is verified, request the Homebrew update:

  ```bash
  gh workflow run update.yml --repo androperator/homebrew-tap --ref main
  ```

  Use existing `gh` authorization; do not create a cross-repository CI token.
  Capture the dispatched run URL/ID from the response so an older scheduled run
  cannot be mistaken for this request. Inspect that run and the committed
  `Formula/emulator.rb` version before reporting Homebrew availability.
- If Homebrew fails, inspect its failing step and log. A tarball 404 may reflect
  propagation on the runner even after a local install succeeded. Recheck the
  registry tarball; retry the update dispatch once after a short delay if this
  is consistent with propagation and the tarball is now downloadable. Do not repeatedly dispatch an unchanged
  failing run. Dependency-age holds, dispatch failures, persistent 404s and
  updater defects must be reported with their actual evidence; do not label
  every failure as Homebrew's 24-hour dependency policy.
- If the tap has not advanced, report Homebrew deferred, its current formula
  version and update run URL. Verify the hourly schedule is still configured
  before promising automatic retries. A deferred tap update does not undo the
  npm release or require a new version/tag. Changes to the tap's updater are
  separate implementation work, not an automatic part of releasing this package.
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
release tag with an unpublished version, inspect whether a run is active or npm
is still processing an accepted publication. Resume verification in those cases.
Only after a confirmed failed publish with no accepted version, investigate the
failure and use the workflow's manual `release_tag` dispatch within existing
release authorization.
If a fix needs a new commit, use a new version/tag rather than moving the old tag.
Published versions cannot be overwritten.

Bootstrap instructions are in
[docs/releasing.md](../../../docs/releasing.md). The npm organization and Trusted
Publisher were configured and verified by the successful `0.1.1` OIDC release.
