#!/usr/bin/env bun
/**
 * Automated release script for gecko monorepo.
 *
 * Bumps version across all package.json files and source constants,
 * syncs lockfile, generates CHANGELOG entries from conventional commits,
 * commits, tags, pushes, and creates a GitHub release.
 *
 * Usage:
 *   bun run release              # patch bump (default)
 *   bun run release -- minor     # minor bump
 *   bun run release -- major     # major bump
 *   bun run release -- 2.0.0     # explicit version
 *   bun run release -- --dry-run # preview without side effects
 *
 * Env:
 *   Requires `gh` CLI authenticated for GitHub release creation.
 */

import { execSync } from "child_process";
import { resolve as pathResolve } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = pathResolve(import.meta.dirname as string, "..");
const PACKAGE_JSON_PATHS = [
  pathResolve(PROJECT_ROOT, "package.json"),
  pathResolve(PROJECT_ROOT, "apps/web-dashboard/package.json"),
];
const CHANGELOG_PATH = pathResolve(PROJECT_ROOT, "CHANGELOG.md");
const MAC_CLIENT_DIR = pathResolve(PROJECT_ROOT, "apps/mac-client");
const PROJECT_YML_PATH = pathResolve(MAC_CLIENT_DIR, "project.yml");
const ABOUT_VIEW_PATH = pathResolve(MAC_CLIENT_DIR, "Gecko/Sources/Views/AboutView.swift");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, opts?: { dry?: boolean; cwd?: string }): string {
  const cwd = opts?.cwd ?? PROJECT_ROOT;
  if (opts?.dry) {
    console.log(`[dry-run] ${cmd}`);
    return "";
  }
  console.log(`$ ${cmd}`);
  return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "inherit"] }).trim();
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(current: string, type: string): string {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      // explicit version
      if (/^\d+\.\d+\.\d+$/.test(type)) return type;
      throw new Error(`Invalid version or bump type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Changelog generation
// ---------------------------------------------------------------------------

interface ConventionalCommit {
  type: string;
  scope?: string;
  description: string;
  breaking: boolean;
}

function parseConventionalCommit(subject: string): ConventionalCommit | null {
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!match) return null;
  return {
    type: match[1],
    scope: match[2] || undefined,
    description: match[4],
    breaking: !!match[3],
  };
}

const TYPE_HEADERS: Record<string, string> = {
  feat: "Added",
  fix: "Fixed",
  perf: "Performance",
  refactor: "Changed",
  docs: "Documentation",
  chore: "Maintenance",
  ci: "CI",
  test: "Tests",
  style: "Style",
  build: "Build",
};

function generateChangelog(version: string, dry: boolean): string {
  const lastTag = run("git describe --tags --abbrev=0", { dry: false });
  const logOutput = run(`git log ${lastTag}..HEAD --pretty=format:"%s"`, { dry: false });

  if (!logOutput) return "";

  const lines = logOutput.split("\n").filter(Boolean);
  const grouped: Record<string, string[]> = {};

  for (const line of lines) {
    const clean = line.replace(/^"|"$/g, "");
    // Skip release commits and merge commits
    if (clean.startsWith("release:") || clean.startsWith("Merge ")) continue;

    const parsed = parseConventionalCommit(clean);
    if (!parsed) continue;

    const header = TYPE_HEADERS[parsed.type] || "Other";
    if (!grouped[header]) grouped[header] = [];
    const scope = parsed.scope ? `**${parsed.scope}**: ` : "";
    grouped[header].push(`- ${scope}${parsed.description}`);
  }

  if (Object.keys(grouped).length === 0) return "";

  const today = new Date().toISOString().slice(0, 10);
  let entry = `## [${version}] - ${today}\n`;

  // Order: Added, Fixed, Changed, Performance, then rest
  const order = ["Added", "Fixed", "Changed", "Performance"];
  const sortedHeaders = [
    ...order.filter((h) => grouped[h]),
    ...Object.keys(grouped)
      .filter((h) => !order.includes(h))
      .sort(),
  ];

  for (const header of sortedHeaders) {
    entry += `\n### ${header}\n`;
    for (const item of grouped[header]) {
      entry += `${item}\n`;
    }
  }

  return entry;
}

function updateChangelog(entry: string, dry: boolean): void {
  if (!entry) return;
  if (!existsSync(CHANGELOG_PATH)) {
    if (dry) {
      console.log("[dry-run] Would create CHANGELOG.md");
      return;
    }
    writeFileSync(CHANGELOG_PATH, `# Changelog\n\n${entry}\n`);
    return;
  }

  const content = readFileSync(CHANGELOG_PATH, "utf-8");
  // Insert after the header block
  const insertPoint = content.indexOf("\n## ");
  if (insertPoint === -1) {
    // No existing entries, append
    if (dry) {
      console.log("[dry-run] Would append to CHANGELOG.md");
      return;
    }
    writeFileSync(CHANGELOG_PATH, content.trimEnd() + "\n\n" + entry + "\n");
  } else {
    if (dry) {
      console.log("[dry-run] Would insert into CHANGELOG.md");
      return;
    }
    const before = content.slice(0, insertPoint);
    const after = content.slice(insertPoint);
    writeFileSync(CHANGELOG_PATH, before + "\n" + entry + after);
  }
}

// ---------------------------------------------------------------------------
// Version constants (version.ts files)
// ---------------------------------------------------------------------------

function updateVersionConstants(version: string, dry: boolean): void {
  // Search for version.ts files that export version constants
  try {
    const result = run('find . -name "version.ts" -not -path "*/node_modules/*"', { dry: false });
    if (!result) return;

    for (const file of result.split("\n").filter(Boolean)) {
      const absPath = pathResolve(PROJECT_ROOT, file);
      const content = readFileSync(absPath, "utf-8");
      const updated = content.replace(
        /((?:export\s+(?:const|let)\s+(?:VERSION|version|APP_VERSION)\s*=\s*)(["']))[\d.]+\2/g,
        `$1${version}$2`
      );
      if (updated !== content) {
        console.log(`  Updating version constant in ${file}`);
        if (!dry) writeFileSync(absPath, updated);
      }
    }
  } catch {
    // No version.ts files found, skip
  }
}

// ---------------------------------------------------------------------------
// Mac app versioning
// ---------------------------------------------------------------------------

function updateMacVersions(version: string, dry: boolean): void {
  // project.yml — MARKETING_VERSION
  const ymlContent = readFileSync(PROJECT_YML_PATH, "utf-8");
  const ymlUpdated = ymlContent.replace(
    /MARKETING_VERSION: "[\d.]+"/,
    `MARKETING_VERSION: "${version}"`
  );
  if (ymlUpdated !== ymlContent) {
    console.log(`  apps/mac-client/project.yml: MARKETING_VERSION → ${version}`);
    if (!dry) writeFileSync(PROJECT_YML_PATH, ymlUpdated);
  }

  // AboutView.swift — fallback version string
  const swiftContent = readFileSync(ABOUT_VIEW_PATH, "utf-8");
  const swiftUpdated = swiftContent.replace(
    /\?\? "[\d.]+"/,
    `?? "${version}"`
  );
  if (swiftUpdated !== swiftContent) {
    console.log(`  apps/mac-client/.../AboutView.swift: fallback → ${version}`);
    if (!dry) writeFileSync(ABOUT_VIEW_PATH, swiftUpdated);
  }

  // Regenerate Xcode project
  console.log("  Regenerating Xcode project...");
  run("xcodegen generate", { dry, cwd: MAC_CLIENT_DIR });
}

// ---------------------------------------------------------------------------
// DMG build + upload
// ---------------------------------------------------------------------------

function buildAndUploadDmg(version: string, dry: boolean): void {
  if (dry) {
    console.log(`[dry-run] ./scripts/build-dmg.sh`);
    console.log(`[dry-run] gh release upload v${version} build/Gecko-${version}.dmg`);
    return;
  }

  console.log("  Building DMG...");
  run("./scripts/build-dmg.sh", { cwd: PROJECT_ROOT });

  const dmgPath = pathResolve(PROJECT_ROOT, `build/Gecko-${version}.dmg`);
  if (!existsSync(dmgPath)) {
    throw new Error(`DMG not found at ${dmgPath}`);
  }

  console.log("  Uploading DMG to GitHub release...");
  run(`gh release upload v${version} ${dmgPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const bumpArg = args.find((a) => a !== "--dry-run") ?? "patch";

  // Read current version
  const rootPkg = readJson(PACKAGE_JSON_PATHS[0]);
  const currentVersion = rootPkg.version;
  const nextVersion = bumpVersion(currentVersion, bumpArg);

  console.log(`\n🚀 Release: ${currentVersion} → ${nextVersion}${dry ? " (dry run)" : ""}\n`);

  // 1. Bump versions in all package.json files
  console.log("📦 Bumping package.json versions...");
  for (const pkgPath of PACKAGE_JSON_PATHS) {
    if (!existsSync(pkgPath)) continue;
    const pkg = readJson(pkgPath);
    console.log(`  ${pkgPath.replace(PROJECT_ROOT + "/", "")}: ${pkg.version} → ${nextVersion}`);
    if (!dry) {
      pkg.version = nextVersion;
      writeJson(pkgPath, pkg);
    }
  }

  // 2. Update version.ts constants if any
  console.log("\n🔍 Checking for version constants...");
  updateVersionConstants(nextVersion, dry);

  // 3. Update Mac app versions (project.yml + AboutView.swift + xcodegen)
  console.log("\n🍎 Updating Mac app versions...");
  updateMacVersions(nextVersion, dry);

  // 4. Sync lockfile
  console.log("\n📦 Syncing lockfile...");
  run("bun install", { dry });

  // 5. Generate changelog
  console.log("\n📝 Generating changelog...");
  const changelogEntry = generateChangelog(nextVersion, dry);
  if (changelogEntry) {
    console.log(changelogEntry);
    updateChangelog(changelogEntry, dry);
  } else {
    console.log("  No conventional commits found since last tag.");
  }

  // 6. Git commit, tag, push
  console.log("\n📌 Committing and tagging...");
  run("git add -A", { dry });
  run(`git commit -m "release: v${nextVersion}"`, { dry });
  run(`git tag v${nextVersion}`, { dry });
  run("git push", { dry });
  run("git push --tags", { dry });

  // 7. GitHub release
  console.log("\n🎉 Creating GitHub release...");
  const releaseNotes = changelogEntry || `Release v${nextVersion}`;
  const notesFile = pathResolve(PROJECT_ROOT, ".release-notes-tmp.md");
  if (!dry) {
    writeFileSync(notesFile, releaseNotes);
    try {
      run(`gh release create v${nextVersion} --title "v${nextVersion}" --notes-file ${notesFile}`);
    } finally {
      try {
        run(`rm ${notesFile}`);
      } catch {}
    }
  } else {
    console.log(`[dry-run] gh release create v${nextVersion}`);
  }

  // 8. Build and upload DMG
  console.log("\n📀 Building and uploading DMG...");
  buildAndUploadDmg(nextVersion, dry);

  console.log(`\n✅ Released v${nextVersion}!`);
}

main().catch((err) => {
  console.error("❌ Release failed:", err.message);
  process.exit(1);
});
