#!/usr/bin/env tsx
/**
 * AutoEQ Preset Import Script (Build-Time Only)
 * 
 * Usage: npm run import:autoeq
 * 
 * This script:
 * 1. Clones AutoEQ repo into temp vendor/ directory (gitignored)
 * 2. Parses results/README.md to find devices to import
 * 3. Converts ParametricEQ.txt files to EqPresetV1 JSON
 * 4. Writes deterministic output to server/data/configs/autoeq/
 * 5. Cleans up vendor directory
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { parseParametricEQ, ParseError } from './autoeqParser.js';

const AUTOEQ_REPO = 'https://github.com/jaakkopasanen/AutoEq.git';
const VENDOR_DIR = './vendor/autoeq';
const OUTPUT_DIR = './server/data/configs/autoeq';

interface DeviceReference {
  category: 'headphones' | 'iems' | 'speakers' | 'unknown';
  folderPath: string; // relative to results/<category>/
  deviceName: string;
}

/**
 * Main import function
 */
async function main() {
  console.log('🎧 AutoEQ Preset Import');
  console.log('========================\n');

  try {
    // Step 1: Clone AutoEQ repo
    await cloneAutoEQ();

    // Step 2: Parse results/README.md to get device list
    const devices = await extractDevicesFromReadme();
    console.log(`\n📋 Found ${devices.length} devices referenced in README.md\n`);

    // Step 3: Process each device and collect metadata
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    const manifestEntries: any[] = [];

    for (const device of devices) {
      try {
        const metadata = await processDevice(device);
        if (metadata) {
          manifestEntries.push(metadata);
        }
        successCount++;
      } catch (error) {
        if (error instanceof ParseError) {
          console.error(`❌ Skip: ${device.deviceName} - ${error.message}`);
          skipCount++;
        } else {
          console.error(`❌ Error: ${device.deviceName} - ${(error as Error).message}`);
          errorCount++;
        }
      }
    }

    // Step 4: Write manifest file
    await writeManifest(manifestEntries);

    console.log(`\n✅ Import complete:`);
    console.log(`   ${successCount} presets imported`);
    if (skipCount > 0) {
      console.log(`   ${skipCount} presets skipped (parse errors)`);
    }
    if (errorCount > 0) {
      console.log(`   ${errorCount} presets failed (unexpected errors)`);
    }
  } finally {
    // Step 4: Clean up vendor directory
    await cleanupVendor();
  }
}

/**
 * Clone AutoEQ repository into vendor directory
 * Uses sparse checkout to only download the results/ directory
 */
async function cloneAutoEQ() {
  console.log('📦 Cloning AutoEQ repository (sparse checkout - results only)...');
  
  // Remove existing vendor directory if present
  try {
    await fs.rm(VENDOR_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }

  // Create vendor directory
  await fs.mkdir(VENDOR_DIR, { recursive: true });

  try {
    // Initialize sparse checkout
    execSync('git init', { cwd: VENDOR_DIR, stdio: 'pipe' });
    execSync(`git remote add origin ${AUTOEQ_REPO}`, { cwd: VENDOR_DIR, stdio: 'pipe' });
    execSync('git config core.sparseCheckout true', { cwd: VENDOR_DIR, stdio: 'pipe' });
    
    // Only checkout results/ directory
    await fs.writeFile(join(VENDOR_DIR, '.git', 'info', 'sparse-checkout'), 'results/\n', 'utf-8');
    
    // Fetch and checkout
    console.log('   Fetching results directory...');
    execSync('git fetch --depth 1 origin master', { cwd: VENDOR_DIR, stdio: 'inherit' });
    execSync('git checkout master', { cwd: VENDOR_DIR, stdio: 'pipe' });
    
    console.log('✅ Clone complete\n');
  } catch (error) {
    throw new Error(`Failed to clone AutoEQ repository: ${(error as Error).message}`);
  }
}

/**
 * Extract device references from results/README.md
 * 
 * The README contains unordered lists with links like:
 * - [Device Name](./Device%20Name/)
 */
async function extractDevicesFromReadme(): Promise<DeviceReference[]> {
  console.log('📖 Parsing results/README.md...');

  const readmePath = join(VENDOR_DIR, 'results', 'README.md');
  const content = await fs.readFile(readmePath, 'utf-8');

  const devices: DeviceReference[] = [];

  // Split by lines and look for markdown links to device folders
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Only process list items that start with "- ["
    if (!line.trim().startsWith('- [')) continue;
    
    // Match markdown links: [Device Name](./path/to/Device%20Folder/)
    // Use greedy .+ to capture up to the LAST ) on the line (handles embedded parens in URLs)
    const linkMatch = line.match(/^\s*-\s*\[([^\]]+)\]\(\.\/(.+)\)\s*$/);
    if (!linkMatch) continue;

    const deviceName = linkMatch[1].trim();
    let encodedPath = linkMatch[2];
    
    // Remove trailing slash if present
    encodedPath = encodedPath.replace(/\/$/, '');
    
    // Decode URL-encoded path (e.g., %20 -> space)
    const folderPath = decodeURIComponent(encodedPath);

    // Determine category from the context (which section of README we're in)
    // We'll infer this from the folder structure when we process the device
    // For now, mark as unknown and resolve later
    devices.push({
      category: 'unknown',
      folderPath,
      deviceName,
    });
  }

  return devices;
}

/**
 * Process a single device: read ParametricEQ.txt, parse, write JSON
 * Returns metadata for manifest
 */
async function processDevice(device: DeviceReference): Promise<any> {
  // Determine full path to device folder
  const deviceFolderPath = join(VENDOR_DIR, 'results', device.folderPath);
  
  // Infer category from path segments (look for 'in-ear', 'over-ear', etc.)
  let category: 'headphones' | 'iems' | 'speakers' | 'unknown' = 'unknown';
  const pathLower = device.folderPath.toLowerCase();
  
  if (pathLower.includes('in-ear')) {
    category = 'iems';
  } else if (pathLower.includes('over-ear') || pathLower.includes('on-ear')) {
    category = 'headphones';
  } else if (pathLower.includes('speaker')) {
    category = 'speakers';
  }

  // Find ParametricEQ file (AutoEQ uses device-named files like "Device Name ParametricEQ.txt")
  let parametricEqPath: string;
  try {
    const entries = await fs.readdir(deviceFolderPath);
    const parametricFiles = entries.filter(f => f.endsWith('ParametricEQ.txt'));
    
    if (parametricFiles.length === 0) {
      throw new ParseError(`No *ParametricEQ.txt file found in ${deviceFolderPath}`, 0, '');
    }
    if (parametricFiles.length > 1) {
      throw new ParseError(`Multiple ParametricEQ.txt files found, cannot determine which to use`, 0, '');
    }
    
    parametricEqPath = join(deviceFolderPath, parametricFiles[0]);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(`Failed to scan directory: ${(error as Error).message}`, 0, '');
  }

  // Read ParametricEQ.txt
  let content: string;
  try {
    content = await fs.readFile(parametricEqPath, 'utf-8');
  } catch (error) {
    throw new ParseError(`Failed to read ${parametricEqPath}: ${(error as Error).message}`, 0, '');
  }

  // Parse device name to extract manufacturer and model
  const { manufacturer, model, variant } = parseDeviceName(device.deviceName);

  // Parse ParametricEQ.txt
  const sourcePath = `results/${device.folderPath}`;
  const { preset, warnings } = parseParametricEQ(
    content,
    device.deviceName,
    category,
    manufacturer,
    model,
    variant,
    sourcePath
  );

  // Log warnings if any
  if (warnings.length > 0) {
    console.log(`⚠️  ${device.deviceName}:`);
    for (const warning of warnings) {
      console.log(`   ${warning.field}: ${warning.message} (${warning.originalValue} → ${warning.normalizedValue})`);
    }
  }

  // Write JSON to output directory and get file stats
  const { relativePath, stats } = await writePresetJson(preset, category);

  console.log(`✅ ${device.deviceName} (${preset.bands.length} bands)`);

  // Build metadata entry for manifest (using same ID algorithm as ConfigsLibrary)
  const id = relativePath
    .replace('.json', '')
    .toLowerCase()
    .replace(/[\/\\]/g, '--')
    .replace(/\s+/g, '-');

  return {
    id,
    configName: preset.name,
    file: relativePath,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    presetType: 'eq',
    source: 'autoeq',
    readOnly: true,
    category: preset.device.category,
    manufacturer: preset.device.manufacturer,
    model: preset.device.model,
    variant: preset.device.variant,
  };
}

/**
 * Parse device name to extract manufacturer, model, and variant
 * 
 * Examples:
 * "Sennheiser HD 6XX" -> { manufacturer: "Sennheiser", model: "HD 6XX" }
 * "Audio-Technica ATH-M50x" -> { manufacturer: "Audio-Technica", model: "ATH-M50x" }
 * "Audeze LCD-X 2021" -> { manufacturer: "Audeze", model: "LCD-X", variant: "2021" }
 */
function parseDeviceName(name: string): {
  manufacturer: string;
  model: string;
  variant?: string;
} {
  // Split by first space to get manufacturer
  const parts = name.split(' ');
  
  if (parts.length === 0) {
    return { manufacturer: 'Unknown', model: name };
  }

  // First part is usually manufacturer
  const manufacturer = parts[0];
  
  // Remaining parts are model + variant
  const rest = parts.slice(1).join(' ');
  
  // Check for common variant patterns (year, "Measurement", etc.)
  const variantMatch = rest.match(/(.+?)\s+(20\d{2}|Measurement|Sample\s+\d+)$/i);
  
  if (variantMatch) {
    return {
      manufacturer,
      model: variantMatch[1].trim(),
      variant: variantMatch[2].trim(),
    };
  }

  return {
    manufacturer,
    model: rest || manufacturer,
  };
}

/**
 * Write preset JSON to output directory
 * File path: server/data/configs/autoeq/<category>/<Manufacturer> <Model>[-<Variant>].json
 * Returns relative path and file stats for manifest building
 */
async function writePresetJson(
  preset: any,
  category: 'headphones' | 'iems' | 'speakers' | 'unknown'
): Promise<{ relativePath: string; stats: { mtimeMs: number; size: number } }> {
  const categoryDir = join(OUTPUT_DIR, category);
  await fs.mkdir(categoryDir, { recursive: true });

  // Build filename: <Manufacturer> <Model>[-<Variant>].json
  let filename = `${preset.device.manufacturer} ${preset.device.model}`;
  if (preset.device.variant) {
    filename += ` ${preset.device.variant}`;
  }
  filename += '.json';

  const outputPath = join(categoryDir, filename);

  // Write deterministic JSON (sorted keys, 2-space indent)
  const json = JSON.stringify(preset, null, 2);
  await fs.writeFile(outputPath, json + '\n', 'utf-8');

  // Get file stats
  const stats = await fs.stat(outputPath);

  // Build relative path from OUTPUT_DIR
  const relativePath = `autoeq/${category}/${filename}`;

  return {
    relativePath,
    stats: {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    },
  };
}

/**
 * Write manifest file with all AutoEQ preset metadata
 * This allows ConfigsLibrary to load AutoEQ presets without scanning files
 */
async function writeManifest(entries: any[]) {
  console.log(`\n📝 Writing manifest file with ${entries.length} entries...`);

  // Sort entries by configName for deterministic output
  entries.sort((a, b) => a.configName.localeCompare(b.configName));

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      repo: AUTOEQ_REPO,
    },
    configs: entries,
  };

  const manifestPath = join(OUTPUT_DIR, 'index.json');
  const json = JSON.stringify(manifest, null, 2);
  
  await fs.writeFile(manifestPath, json + '\n', 'utf-8');

  console.log(`✅ Manifest written to ${manifestPath}`);
}

/**
 * Clean up vendor directory
 */
async function cleanupVendor() {
  console.log('\n🧹 Cleaning up vendor directory...');
  try {
    await fs.rm(VENDOR_DIR, { recursive: true, force: true });
    console.log('✅ Cleanup complete');
  } catch (error) {
    console.warn(`⚠️  Failed to clean up vendor directory: ${(error as Error).message}`);
  }
}

// Run main function
main().catch((error) => {
  console.error('\n❌ Import failed:');
  console.error(error);
  process.exit(1);
});
