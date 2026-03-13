#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const inGitRepo = canRunGit();

if (inGitRepo && !options.allowDirty) {
  const status = run('git', ['status', '--porcelain'], {
    capture: true,
  }).trim();
  if (status) {
    fail(
      'Git working tree is not clean. Commit or stash changes first, or rerun with --allow-dirty.',
    );
  }
}

if (!options.dryRun) {
  run('npm', ['whoami']);
}

let newVersion;
let published = false;

try {
  run('npm', [
    'version',
    options.release,
    '--no-git-tag-version',
    ...(options.preid ? ['--preid', options.preid] : []),
  ]);

  newVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;

  if (newVersion === currentVersion) {
    fail(
      `Version did not change. Current version is already ${currentVersion}.`,
    );
  }

  const publishedVersion = getPublishedVersion(packageName);
  if (publishedVersion === newVersion) {
    fail(`Version ${newVersion} is already published to npm.`);
  }

  if (!options.skipChecks) {
    run('npm', ['run', 'lint']);
    run('npm', ['test']);
    run('npm', ['run', 'test:types']);
  }

  run('npm', ['run', 'dist']);
  run('npm', ['pack', '--dry-run']);

  const publishArgs = [
    'publish',
    '--access',
    options.access,
    ...(options.tag ? ['--tag', options.tag] : []),
    ...(options.dryRun ? ['--dry-run'] : []),
  ];

  run('npm', publishArgs);
  published = !options.dryRun;

  if (options.dryRun) {
    restorePackageFiles();
    log(
      `Dry run complete. Version changes were reverted to ${currentVersion}.`,
    );
    process.exit(0);
  }

  if (inGitRepo && !options.skipGit) {
    const filesToAdd = ['package.json'];
    if (hasPackageLock) {
      filesToAdd.push('package-lock.json');
    }

    run('git', ['add', ...filesToAdd]);
    run('git', ['commit', '-m', `Release v${newVersion}`]);
    run('git', ['tag', `v${newVersion}`]);
  }

  log(`Published ${packageName}@${newVersion} to npm.`);
  if (inGitRepo && !options.skipGit) {
    log(`Created git commit and tag v${newVersion}.`);
  }
} catch (error) {
  if (!published) {
    restorePackageFiles();
  }

  throw error;
}

function parseArgs(argv) {
  const positional = [];
  const parsed = {
    release: '',
    access: 'public',
    allowDirty: false,
    dryRun: false,
    preid: '',
    skipGit: false,
    skipChecks: false,
    tag: '',
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

    if (arg === '--allow-dirty') {
      parsed.allowDirty = true;
      continue;
    }

    if (arg === '--skip-git') {
      parsed.skipGit = true;
      continue;
    }

    if (arg === '--skip-checks') {
      parsed.skipChecks = true;
      continue;
    }

    if (arg === '--tag' || arg === '--preid' || arg === '--access') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        fail(`Missing value for ${arg}.`);
      }

      if (arg === '--tag') {
        parsed.tag = value;
      }

      if (arg === '--preid') {
        parsed.preid = value;
      }

      if (arg === '--access') {
        if (value !== 'public' && value !== 'restricted') {
          fail('--access must be either "public" or "restricted".');
        }
        parsed.access = value;
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

function getPublishedVersion(name) {
  try {
    return run('npm', ['view', name, 'version', '--json'], { capture: true })
      .trim()
      .replace(/^"|"$/g, '');
  } catch {
    return '';
  }
}

function restorePackageFiles() {
  writeFileSync(packageJsonPath, packageJsonBackup);

  if (hasPackageLock && packageLockBackup !== null) {
    writeFileSync(packageLockPath, packageLockBackup);
  }
}

function run(command, commandArgs, options = {}) {
  const result = execFileSync(command, commandArgs, {
    cwd: rootDir,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });

  return typeof result === 'string' ? result : '';
}

function printUsage() {
  process.stdout.write(`Usage:
  npm run release:npm -- <patch|minor|major|prepatch|preminor|premajor|prerelease|x.y.z> [options]

Options:
  --tag <tag>             Publish with an npm dist-tag, e.g. beta
  --preid <name>          Pre-release identifier, e.g. beta
  --access <mode>         npm access level: public or restricted
  --dry-run               Preview the release without publishing or keeping version changes
  --allow-dirty           Allow running with uncommitted git changes
  --skip-git              Do not create a git commit and tag after publishing
  --skip-checks           Skip lint, tests, and typecheck before publishing
`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function log(message) {
  process.stdout.write(`${message}\n`);
}
