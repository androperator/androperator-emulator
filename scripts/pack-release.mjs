import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(manifest.name, '@androperator/emulator');
if (process.env.RELEASE_TAG) {
  assert.match(process.env.RELEASE_TAG, /^v\d+\.\d+\.\d+$/);
  assert.equal(process.env.RELEASE_TAG, `v${manifest.version}`);
}
const temporary = mkdtempSync(join(tmpdir(), 'emulator-release-'));
const run = (command, args, cwd = process.cwd()) => execFileSync(command, args, { cwd, encoding: 'utf8' });
try {
  const [packed] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporary]));
  const files = packed.files.map(({ path }) => path);
  for (const required of ['package.json', 'dist/index.js', 'dist/index.d.ts', 'dist/cli.js', 'README.md', 'LICENSE', 'NOTICE']) {
    assert.ok(files.includes(required), `Missing ${required}`);
  }
  assert.ok(files.every((path) => ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'docs/provenance.md'].includes(path)
    || (path.startsWith('dist/') && !path.startsWith('dist/test/') && !path.endsWith('.map'))), 'Unexpected archive contents');
  const archive = join(temporary, packed.filename);
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive], temporary);
  const cli = join(temporary, 'node_modules/.bin/androperator-emulator');
  const version = JSON.parse(run(cli, ['--version'], temporary));
  assert.equal(version.ok, true);
  assert.equal(version.data.name, manifest.name);
  assert.equal(version.data.version, manifest.version);
  run(cli, ['--help'], temporary);
  run(process.execPath, ['--input-type=module', '-e', "import { getDefaultRuntimeConfig } from '@androperator/emulator'; if (typeof getDefaultRuntimeConfig !== 'function') throw new Error('Missing library export');"], temporary);
  if (process.argv[2]) {
    const destination = resolve(process.argv[2]);
    copyFileSync(archive, destination);
    console.log(`Validated archive: ${destination}`);
  } else {
    console.log(`Validated ${manifest.name}@${manifest.version}; archive contents and installed CLI/library passed.`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
