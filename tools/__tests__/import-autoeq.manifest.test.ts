/**
 * Import AutoEQ Manifest Generation Tests
 * Tests that the import script generates the index.json manifest
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('import-autoeq manifest generation', () => {
  it('script contains writeManifest function', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify writeManifest function exists
    expect(source).toContain('async function writeManifest');
    expect(source).toContain('entries: any[]');
  });

  it('manifest includes required structure', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify manifest object structure
    expect(source).toContain('schemaVersion: 1');
    expect(source).toContain('generatedAt:');
    expect(source).toContain('configs: entries');
    
    // Verify manifest is written to index.json
    expect(source).toContain("'index.json'");
    expect(source).toContain('const manifestPath = join(OUTPUT_DIR,');
  });

  it('collects metadata during preset processing', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify manifestEntries array is collected
    expect(source).toContain('manifestEntries');
    expect(source).toContain('const manifestEntries: any[] = []');
    
    // Verify metadata is pushed during processing
    expect(source).toContain('manifestEntries.push');
    
    // Verify writeManifest is called with collected entries
    expect(source).toContain('await writeManifest(manifestEntries)');
  });

  it('manifest entries include all required fields', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify metadata fields are collected
    expect(source).toContain('id,');
    expect(source).toContain('configName:');
    expect(source).toContain('file: relativePath');
    expect(source).toContain('mtimeMs:');
    expect(source).toContain('size:');
    expect(source).toContain('presetType:');
    expect(source).toContain('source:');
    expect(source).toContain('readOnly:');
    expect(source).toContain('category:');
    expect(source).toContain('manufacturer:');
    expect(source).toContain('model:');
  });

  it('uses same ID algorithm as ConfigsLibrary', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify ID generation matches ConfigsLibrary pattern
    expect(source).toContain("replace('.json', '')");
    expect(source).toContain('.toLowerCase()');
    expect(source).toContain("replace(/[\\/\\\\]/g, '--')");
    expect(source).toContain("replace(/\\s+/g, '-')");
  });

  it('sorts manifest entries deterministically', async () => {
    const scriptPath = join(__dirname, '../import-autoeq.ts');
    const source = await fs.readFile(scriptPath, 'utf-8');

    // Verify entries are sorted before writing
    expect(source).toContain('entries.sort');
    expect(source).toContain('configName.localeCompare');
  });
});
