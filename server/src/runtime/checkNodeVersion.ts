/**
 * Runtime Node.js version enforcement
 * Ensures the application runs on a supported Node version
 */

const MIN_NODE_VERSION = 18;
const MAX_NODE_VERSION = 25;

/**
 * Check if the current Node.js version is supported
 * @returns true if supported, false otherwise
 */
export function checkNodeVersion(): boolean {
  const versionMatch = process.version.match(/^v(\d+)\.\d+\.\d+/);
  if (!versionMatch) {
    return false;
  }

  const majorVersion = parseInt(versionMatch[1], 10);
  return majorVersion >= MIN_NODE_VERSION && majorVersion < MAX_NODE_VERSION;
}

/**
 * Enforce Node.js version requirement
 * Exits the process if the version is not supported
 */
export function enforceNodeVersion(): void {
  if (!checkNodeVersion()) {
    console.error('╔════════════════════════════════════════════════════════════════╗');
    console.error('║  ERROR: Unsupported Node.js version                           ║');
    console.error('╠════════════════════════════════════════════════════════════════╣');
    console.error(`║  Current version: ${process.version.padEnd(44)}║`);
    console.error(`║  Required: >= ${MIN_NODE_VERSION}.0.0 and < ${MAX_NODE_VERSION}.0.0${' '.repeat(32)}║`);
    console.error('╠════════════════════════════════════════════════════════════════╣');
    console.error('║  Please upgrade Node.js to a supported LTS version:           ║');
    console.error('║  https://nodejs.org/                                           ║');
    console.error('╚════════════════════════════════════════════════════════════════╝');
    process.exit(1);
  }
}
