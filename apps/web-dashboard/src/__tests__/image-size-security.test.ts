import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const CHILD_TIMEOUT_MS = 2_000;

const ICNS_ZERO_LENGTH_POC = `
const { imageSize } = require("image-size");
const { ICNS } = require("image-size/types/icns");

const input = Buffer.alloc(16);
input.write("icns", 0, "ascii");
input.writeUInt32BE(16, 4);
input.write("icp4", 8, "ascii");
input.writeUInt32BE(0, 12);

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
  directEntry: run(() => ICNS.calculate(input)),
}));
`;

describe("image-size security patch", () => {
  test("public and direct ICNS parsers handle a zero-length entry consistently", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, ["-e", ICNS_ZERO_LENGTH_POC], {
      cwd: resolve(__dirname, "../.."),
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });

    const result = JSON.parse(stdout) as {
      publicEntry: unknown;
      directEntry: unknown;
    };

    expect(stderr).toBe("");
    expect(result.publicEntry).toEqual(result.directEntry);
    expect(result.publicEntry).toEqual({
      ok: true,
      value: { width: 16, height: 16 },
    });
  });
});
