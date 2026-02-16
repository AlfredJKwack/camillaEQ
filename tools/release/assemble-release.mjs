#!/usr/bin/env node

/**
 * Local release assembly script
 * 
 * Mimics the GitHub Actions release workflow exactly:
 * 1. Tests + builds the project
 * 2. Assembles a release directory with runtime-only files
 * 3. Generates runtime package.json + lock
 * 4. Smoke tests the artifact
 * 5. Creates a .tar.gz
 * 
 * Usage:
 *   npm run release:local
 *   npm run release:local -- --version v0.0.0-local
 *   npm run release:local -- --skip-tests --skip-build
 */

import { spawn } from 'child_process';
import { mkdir, cp, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '../..');

// Parse CLI args
const args = process.argv.slice(2);
const versionArg = args.find(a => a.startsWith('--version='))?.split('=')[1];
const skipTests = args.includes('--skip-tests');
const skipBuild = args.includes('--skip-build');
const skipSmokeTest = args.includes('--skip-smoke-test');

// Default to package.json version if not provided
const rootPkgPath = join(ROOT, 'package.json');
const rootPkg = JSON.parse(await readFile(rootPkgPath, 'utf-8'));
const version = versionArg || `v${rootPkg.version}`;

const RELEASE_NAME = `camillaeq-${version}`;
const RELEASE_DIR = join(ROOT, 'release', RELEASE_NAME);
const RELEASE_TARBALL = join(ROOT, 'release', `${RELEASE_NAME}.tar.gz`);

console.log(`\n🔨 Assembling release: ${RELEASE_NAME}\n`);

// Helper to run commands
function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      ...opts,
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}: ${cmd} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });

    proc.on('error', reject);
  });
}

// Helper to find a free port
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Step 1: Run tests
if (!skipTests) {
  console.log('📋 Step 1/8: Running tests...');
  await runCommand('npm', ['test']);
  console.log('✓ Tests passed\n');
} else {
  console.log('⏭️  Step 1/8: Skipping tests (--skip-tests)\n');
}

// Step 2: Build
if (!skipBuild) {
  console.log('🏗️  Step 2/8: Building project...');
  await runCommand('npm', ['run', 'build']);
  console.log('✓ Build complete\n');
} else {
  console.log('⏭️  Step 2/8: Skipping build (--skip-build)\n');
}

// Step 3: Verify build artifacts
console.log('🔍 Step 3/8: Verifying build artifacts...');
const requiredArtifacts = [
  'server/dist/index.js',
  'client/dist/index.html',
  'server/dist/client/index.html',
];
for (const artifact of requiredArtifacts) {
  const path = join(ROOT, artifact);
  if (!existsSync(path)) {
    throw new Error(`ERROR: Required artifact not found: ${artifact}`);
  }
}
console.log('✓ Build artifacts verified\n');

// Step 4: Assemble release directory
console.log('📦 Step 4/8: Assembling release directory...');

// Clean and create release dir
if (existsSync(RELEASE_DIR)) {
  await rm(RELEASE_DIR, { recursive: true, force: true });
}
await mkdir(RELEASE_DIR, { recursive: true });

// Copy server build output
await cp(join(ROOT, 'server/dist'), join(RELEASE_DIR, 'server/dist'), { recursive: true });

// Copy data directory
await cp(join(ROOT, 'server/data'), join(RELEASE_DIR, 'data'), { recursive: true });

// Copy deployment resources
await mkdir(join(RELEASE_DIR, 'deploy'), { recursive: true });
await cp(join(ROOT, 'deploy/systemd'), join(RELEASE_DIR, 'deploy/systemd'), { recursive: true });
await cp(join(ROOT, 'deploy/caddy'), join(RELEASE_DIR, 'deploy/caddy'), { recursive: true });

// Copy tools
await cp(join(ROOT, 'tools'), join(RELEASE_DIR, 'tools'), { recursive: true });

// Copy shared modules (if runtime depends on them)
await cp(join(ROOT, 'shared'), join(RELEASE_DIR, 'shared'), { recursive: true });

// Copy LICENSE
await cp(join(ROOT, 'LICENSE'), join(RELEASE_DIR, 'LICENSE'));

console.log(`✓ Files copied to ${RELEASE_DIR}\n`);

// Step 5: Generate runtime package.json
console.log('📝 Step 5/8: Generating runtime package.json...');

const runtimePkg = {
  name: 'camillaeq',
  version: version.replace(/^v/, ''),
  description: 'CamillaDSP graphical equalizer interface',
  type: 'module',
  scripts: {
    start: 'node server/dist/index.js',
  },
  dependencies: {
    '@fastify/static': '^7.0.4',
    'dotenv': '^16.4.1',
    'fastify': '^4.26.0',
    'pino': '^8.19.0',
    'pino-pretty': '^10.3.1',
    'ws': '^8.19.0',
  },
  engines: {
    node: '>=18.0.0 <25.0.0',
    npm: '>=9.0.0',
  },
};

await writeFile(
  join(RELEASE_DIR, 'package.json'),
  JSON.stringify(runtimePkg, null, 2) + '\n'
);

console.log('✓ Generated runtime package.json\n');

// Step 6: Generate package-lock.json and install dependencies
console.log('📦 Step 6/8: Installing runtime dependencies...');

// Generate package-lock.json
await runCommand('npm', ['install', '--package-lock-only', '--omit=dev'], {
  cwd: RELEASE_DIR,
});

// Validate by installing
await runCommand('npm', ['ci', '--omit=dev'], {
  cwd: RELEASE_DIR,
});

console.log('✓ Dependencies installed and validated\n');

// Step 7: Smoke test the artifact
if (!skipSmokeTest) {
  console.log('🧪 Step 7/8: Running smoke tests...');

  // Get a free port
  const testPort = await getFreePort();
  console.log(`  Using port ${testPort} for smoke test`);

  // Capture server output for debugging
  let serverStderr = '';
  let serverExited = false;

  // Start server in background
  const serverProc = spawn('node', ['server/dist/index.js'], {
    cwd: RELEASE_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SERVER_PORT: testPort.toString(),
      SERVER_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stderr.on('data', (data) => {
    serverStderr += data.toString();
  });

  serverProc.on('exit', (code) => {
    serverExited = true;
    if (code !== 0 && code !== null) {
      console.error(`\n⚠️  Server exited with code ${code}`);
      if (serverStderr) {
        console.error('Server stderr:', serverStderr);
      }
    }
  });

  // Wait for server to be ready
  const baseUrl = `http://127.0.0.1:${testPort}`;
  let serverReady = false;
  
  for (let i = 0; i < 20; i++) {
    if (serverExited) {
      throw new Error(`ERROR: Server process exited prematurely. Check stderr output above.`);
    }
    
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        console.log('  ✓ Server responded to health check');
        serverReady = true;
        break;
      }
    } catch (err) {
      // Server not ready yet, or connection refused
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (!serverReady) {
    serverProc.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
    throw new Error('ERROR: Server did not respond within 10 seconds');
  }

  // Test 1: Root serves HTML
  console.log('  Testing: GET /');
  const rootResponse = await fetch(`${baseUrl}/`);
  const rootHtml = await rootResponse.text();
  if (!rootHtml.includes('<div id="app">')) {
    serverProc.kill();
    throw new Error('ERROR: Root did not return expected HTML');
  }
  console.log('  ✓ Root serves UI (HTML with #app)');

  // Test 2: API endpoint returns JSON
  console.log('  Testing: GET /api/version');
  const versionResponse = await fetch(`${baseUrl}/api/version`);
  const versionJson = await versionResponse.json();
  if (!versionJson.version) {
    serverProc.kill();
    throw new Error('ERROR: API endpoint did not return expected JSON');
  }
  console.log('  ✓ API endpoint returns JSON');

  // Test 3: SPA fallback
  console.log('  Testing: GET /some-ui-route (SPA fallback)');
  const spaResponse = await fetch(`${baseUrl}/some-ui-route`);
  const spaHtml = await spaResponse.text();
  if (!spaHtml.includes('<div id="app">')) {
    serverProc.kill();
    throw new Error('ERROR: SPA fallback did not return HTML');
  }
  console.log('  ✓ SPA fallback works');

  // Test 4: Unknown API route returns JSON 404
  console.log('  Testing: GET /api/nonexistent (JSON 404)');
  const notFoundResponse = await fetch(`${baseUrl}/api/nonexistent`);
  if (notFoundResponse.status !== 404) {
    serverProc.kill();
    throw new Error(`ERROR: Unknown API route returned HTTP ${notFoundResponse.status} (expected 404)`);
  }
  console.log('  ✓ Unknown API route returns 404');

  // Clean up
  serverProc.kill();
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('✓ All smoke tests passed\n');
} else {
  console.log('⏭️  Step 7/8: Skipping smoke tests (--skip-smoke-test)\n');
}

// Step 8: Create tarball
console.log('📦 Step 8/8: Creating tarball...');

await runCommand('tar', ['-czf', `${RELEASE_NAME}.tar.gz`, RELEASE_NAME], {
  cwd: join(ROOT, 'release'),
});

const { statSync } = await import('fs');
const size = statSync(RELEASE_TARBALL).size;
const sizeMB = (size / 1024 / 1024).toFixed(2);

console.log(`✓ Created release tarball: ${RELEASE_TARBALL} (${sizeMB} MB)\n`);

console.log(`✅ Release assembly complete!

📦 Release artifact: release/${RELEASE_NAME}.tar.gz

To test the release locally:
  cd release/${RELEASE_NAME}
  npm ci --omit=dev
  npm start
  # Open http://localhost:3000
`);
