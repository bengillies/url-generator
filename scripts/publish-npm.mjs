#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');
const hasPackageLock = existsSync(packageLockPath);
const packageJsonBackup = readFileSync(packageJsonPath, 'utf8');
const packageLockBackup =
  hasPackageLock ? readFileSync(packageLockPath, 'utf8') : null;

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.length === 0 ? 1 : 0);
}

const options = parseArgs(args);
const packageJson = JSON.parse(packageJsonBackup);
const packageName = packageJson.name;
const currentVersion = packageJson.version;

if (typeof packageName !== 'string' || typeof currentVersion !== 'string') {
  fail('package.json must contain string "name" and "version" fields.');
}

if (!canRunGit()) {
  fail('This release command must run inside a git repository.');
}

const currentBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  capture: true,
}).trim();

if (currentBranch !== 'main') {
  fail(`Release must run from main. Current branch is ${currentBranch}.`);
}

const status = run('git', ['status', '--porcelain'], {
  capture: true,
}).trim();

if (status) {
  fail('Git working tree is not clean. Commit or stash changes first.');
}

run('git', ['remote', 'get-url', 'origin'], { capture: true });

if (!options.dryRun) {
  run('gh', ['auth', 'status']);
}

const newVersion = calculateVersionInTemp(options.release, options.preid);

if (newVersion === currentVersion) {
  fail(`Version did not change. Current version is already ${currentVersion}.`);
}

const publishedVersion = getPublishedVersion(packageName);
if (publishedVersion === newVersion) {
  fail(`Version ${newVersion} is already published to npm.`);
}

run('npm', ['ci']);
run('npm', ['run', 'lint']);
run('npm', ['test']);
run('npm', ['run', 'test:types']);
run('npm', ['run', 'dist']);

if (options.dryRun) {
  run('npm', ['pack', '--dry-run']);
  log(`Dry run complete. Next version would be ${newVersion}.`);
  process.exit(0);
}

let versionApplied = false;
let commitCreated = false;
let tagCreated = false;
let pushed = false;
const tagName = `v${newVersion}`;

try {
  run('npm', [
    'version',
    options.release,
    '--no-git-tag-version',
    ...(options.preid ? ['--preid', options.preid] : []),
  ]);
  versionApplied = true;

  run('npm', ['pack', '--dry-run']);

  const filesToAdd = ['package.json'];
  if (hasPackageLock) {
    filesToAdd.push('package-lock.json');
  }

  run('git', ['add', ...filesToAdd]);
  run('git', ['commit', '-m', `Release v${newVersion}`]);
  commitCreated = true;

  run('git', ['tag', '-a', tagName, '-m', tagName]);
  tagCreated = true;

  run('git', ['push', 'origin', 'main']);
  run('git', ['push', 'origin', tagName]);
  pushed = true;

  const releaseArgs = ['release', 'create', tagName];
  if (isPrereleaseVersion(newVersion)) {
    releaseArgs.push('--prerelease');
  }

  if (options.notes) {
    releaseArgs.push('--notes', options.notes);
  } else {
    releaseArgs.push('--generate-notes');
  }

  run('gh', releaseArgs);

  log(`Created GitHub Release ${tagName}.`);
  log(`GitHub Actions will publish ${packageName}@${newVersion} to npm.`);
} catch (error) {
  if (!pushed) {
    rollbackLocalRelease(tagCreated, commitCreated, versionApplied);
  } else {
    log('');
    log(
      `Git push succeeded, but GitHub Release creation failed for ${tagName}.`,
    );
    log('Release state was not rolled back automatically.');
    log('Recovery steps:');
    log(`  gh release create ${tagName} --generate-notes`);
    log(`  git push origin main`);
    log(`  git push origin ${tagName}`);
  }

  throw error;
}

function parseArgs(argv) {
  const positional = [];
  const parsed = {
    notes: '',
    preid: '',
    release: '',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--preid' || arg === '--notes') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        fail(`Missing value for ${arg}.`);
      }

      if (arg === '--preid') {
        parsed.preid = value;
      } else {
        parsed.notes = value;
      }

      index += 1;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (positional.length !== 1) {
    fail(
      'Provide exactly one release target, such as patch, minor, major, prerelease, or 1.2.3.',
    );
  }

  parsed.release = positional[0];
  return parsed;
}

function canRunGit() {
  try {
    run('git', ['rev-parse', '--is-inside-work-tree'], { capture: true });
    return true;
  } catch {
    return false;
  }
}

function calculateVersionInTemp(release, preid) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'url-generator-release-'));

  try {
    cpSync(packageJsonPath, path.join(tempDir, 'package.json'));
    if (hasPackageLock) {
      cpSync(packageLockPath, path.join(tempDir, 'package-lock.json'));
    }

    run(
      'npm',
      [
        'version',
        release,
        '--no-git-tag-version',
        ...(preid ? ['--preid', preid] : []),
      ],
      { cwd: tempDir },
    );

    return JSON.parse(readFileSync(path.join(tempDir, 'package.json'), 'utf8'))
      .version;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function getPublishedVersion(name) {
  try {
    return run('npm', ['view', name, 'version', '--json'], { capture: true })
      .trim()
      .replace(/^"|"$/g, '');
  } catch {
    return '';
  }
}

function isPrereleaseVersion(version) {
  return version.includes('-');
}

function rollbackLocalRelease(tagCreated, commitCreated, versionApplied) {
  if (tagCreated) {
    run('git', ['tag', '-d', `v${readCurrentVersion()}`]);
  }

  if (commitCreated) {
    run('git', ['reset', '--mixed', 'HEAD~1']);
  }

  if (versionApplied) {
    restorePackageFiles();
  }
}

function readCurrentVersion() {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

function restorePackageFiles() {
  writeFileSync(packageJsonPath, packageJsonBackup);

  if (hasPackageLock && packageLockBackup !== null) {
    writeFileSync(packageLockPath, packageLockBackup);
  }
}

function run(command, commandArgs, options = {}) {
  const result = execFileSync(command, commandArgs, {
    cwd: options.cwd ?? rootDir,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });

  return typeof result === 'string' ? result : '';
}

function printUsage() {
  process.stdout.write(`Usage:
  npm run release -- <patch|minor|major|prepatch|preminor|premajor|prerelease|x.y.z> [options]

Options:
  --preid <name>          Pre-release identifier, e.g. beta
  --notes <text>          Release notes for gh release create
  --dry-run               Validate and calculate the next version without changing tracked files
`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}
