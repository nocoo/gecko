// Single source of truth: read version from package.json at build time.
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
