/**
 * G2: Security gate — osv-scanner + gitleaks.
 *
 * Checks for known vulnerabilities in dependencies (osv-scanner)
 * and leaked secrets in the codebase (gitleaks).
 *
 * Hard fail if tools are not installed — no soft-skip.
 */

async function runCommand(cmd: string[], label: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(cmd, {
      stdout: "pipe",
      stderr: "pipe",
      cwd: `${import.meta.dir}/..`,
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.error(`\n${label} FAILED (exit ${exitCode}):`);
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      return false;
    }

    console.log(`${label}: passed`);
    return true;
  } catch {
    console.error(`${label}: tool not installed. Install it to pass the security gate.`);
    console.error(`  osv-scanner: https://github.com/google/osv-scanner`);
    console.error(`  gitleaks:    https://github.com/gitleaks/gitleaks`);
    return false;
  }
}

async function main() {
  console.log("--- Security Gate ---\n");

  const results = await Promise.all([
    runCommand(
      ["osv-scanner", "scan", "source", "--lockfile=bun.lock", "--config=osv-scanner.toml"],
      "osv-scanner (dependency vulnerabilities)",
    ),
    runCommand(
      ["gitleaks", "detect", "--source=.", "--no-banner", "--config=../../.gitleaks.toml"],
      "gitleaks (secret detection)",
    ),
  ]);

  const allPassed = results.every(Boolean);

  if (!allPassed) {
    console.error("\nSecurity gate FAILED.\n");
    process.exit(1);
  }

  console.log("\nSecurity gate passed.\n");
}

void main();
