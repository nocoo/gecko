/**
 * L1 Coverage gate — runs tests with --coverage and validates threshold.
 *
 * Exit 0 if coverage ≥ 90%, exit 1 otherwise.
 * Hard fail if coverage table cannot be parsed.
 */

const LINE_THRESHOLD = 90;
const FUNCTION_THRESHOLD = 85;

async function main() {
  const proc = Bun.spawn(
    [
      "bun",
      "test",
      "src/__tests__/",
      "--coverage",
      "--timeout",
      "30000",
      "--path-ignore-patterns",
      "**/bdd/**",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      cwd: import.meta.dir + "/..",
    },
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  process.stdout.write(stdout);
  process.stderr.write(stderr);

  if (exitCode !== 0) {
    console.error("\nTests failed — cannot check coverage.");
    process.exit(1);
  }

  // Parse coverage from "All files" summary row (bun may print to stdout or stderr)
  const combined = stdout + "\n" + stderr;
  const match = combined.match(
    /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
  );
  if (!match) {
    console.error("\nCould not parse coverage from test output.");
    process.exit(1);
  }

  const functionCov = parseFloat(match[1] ?? "0");
  const lineCov = parseFloat(match[2] ?? "0");

  console.log(`\n--- Coverage Check ---`);
  console.log(`Function coverage: ${functionCov}%`);
  console.log(`Line coverage:     ${lineCov}%`);
  console.log(`Threshold:         line=${LINE_THRESHOLD}%, function=${FUNCTION_THRESHOLD}%`);

  if (lineCov < LINE_THRESHOLD || functionCov < FUNCTION_THRESHOLD) {
    console.error(
      `\nCoverage below threshold. Please add more tests.\n`,
    );
    process.exit(1);
  }

  console.log(`\nCoverage check passed.\n`);
}

void main();
