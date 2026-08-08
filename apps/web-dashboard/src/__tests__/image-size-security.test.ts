import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const CHILD_TIMEOUT_MS = 2_000;

const FORMATS = ["ICNS", "HEIF", "JXL"] as const;
const MODULE_SYSTEMS = ["cjs", "esm"] as const;

type Format = (typeof FORMATS)[number];
type ModuleSystem = (typeof MODULE_SYSTEMS)[number];

const INPUT_BUILDERS: Record<Format, string> = {
  ICNS: `
const input = Buffer.alloc(16);
input.write("icns", 0, "ascii");
input.writeUInt32BE(16, 4);
input.write("icp4", 8, "ascii");
input.writeUInt32BE(0, 12);
`,
  HEIF: `
const input = Buffer.alloc(64);
input.writeUInt32BE(16, 0);
input.write("ftyp", 4, "ascii");
input.write("mif1", 8, "ascii");
input.writeUInt32BE(48, 16);
input.write("meta", 20, "ascii");
input.writeUInt32BE(36, 28);
input.write("iprp", 32, "ascii");
input.writeUInt32BE(28, 36);
input.write("ipco", 40, "ascii");
input.writeUInt32BE(0, 44);
input.write("ispe", 48, "ascii");
input.writeUInt32BE(16, 56);
input.writeUInt32BE(9, 60);
`,
  JXL: `
const input = Buffer.alloc(44);
input.writeUInt32BE(12, 0);
input.write("JXL ", 4, "ascii");
input.writeUInt32BE(16, 12);
input.write("ftyp", 16, "ascii");
input.write("jxl ", 20, "ascii");
input.writeUInt32BE(0, 28);
input.write("jxlp", 32, "ascii");
`,
};

const EXPECTED_RESULTS: Record<Format, unknown> = {
  ICNS: { ok: true, value: { width: 16, height: 16 } },
  HEIF: { ok: true, value: { width: 16, height: 9 } },
  JXL: { ok: false, error: "Error: Reached end of input" },
};

function buildChildScript(format: Format, moduleSystem: ModuleSystem): string {
  const parserPath = `image-size/types/${format.toLowerCase()}`;
  const imports =
    moduleSystem === "cjs"
      ? `
const { imageSize } = require("image-size");
const { ${format}: directParser } = require("${parserPath}");
`
      : `
import { imageSize } from "image-size";
import { ${format} as directParser } from "${parserPath}";
`;

  return `${imports}
${INPUT_BUILDERS[format]}
const run = (calculate) => {
  try {
    const { width, height } = calculate();
    return { ok: true, value: { width, height } };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};

console.log(JSON.stringify({
  publicEntry: run(() => imageSize(input)),
  directEntry: run(() => directParser.calculate(input)),
}));
`;
}

const TEST_CASES = FORMATS.flatMap((format) =>
  MODULE_SYSTEMS.map((moduleSystem) => ({ format, moduleSystem })),
);

describe("image-size security patch", () => {
  test.each(TEST_CASES)(
    "$format $moduleSystem public and direct parsers terminate",
    async ({ format, moduleSystem }) => {
      const nodeArgs =
        moduleSystem === "esm"
          ? ["--input-type=module", "-e", buildChildScript(format, moduleSystem)]
          : ["-e", buildChildScript(format, moduleSystem)];
      const { stdout, stderr } = await execFileAsync(process.execPath, nodeArgs, {
        cwd: resolve(__dirname, "../.."),
        timeout: CHILD_TIMEOUT_MS,
        killSignal: "SIGKILL",
      });

      const result = JSON.parse(stdout) as {
        publicEntry: unknown;
        directEntry: unknown;
      };

      expect(stderr).toBe("");
      expect(result.publicEntry).toEqual(EXPECTED_RESULTS[format]);
      expect(result.directEntry).toEqual(EXPECTED_RESULTS[format]);
    },
  );
});
