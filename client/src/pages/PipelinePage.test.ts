/**
 * PipelinePage MVP-19 implementation tests
 */

import { describe, it, expect } from 'vitest';

describe('PipelinePage MVP-19 Implementation', () => {
  it('component file exists and can be imported', async () => {
    // Verify the component module can be loaded
    const module = await import('./PipelinePage.svelte');
    expect(module).toBeDefined();
    expect(module.default).toBeDefined();
  });

  it('contains required structure elements in source', async () => {
    // Read the component source to verify structure
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify pipeline container structure
    expect(source).toContain('pipeline-page');
    expect(source).toContain('pipeline-container');
    expect(source).toContain('pipeline-blocks');
    
    // Verify flow indicators
    expect(source).toContain('input-indicator');
    expect(source).toContain('output-indicator');
    expect(source).toContain('INPUT');
    expect(source).toContain('OUTPUT');
    
    // Verify block components are used
    expect(source).toContain('FilterBlock');
    expect(source).toContain('MixerBlock');
    expect(source).toContain('ProcessorBlock');
    
    // Verify imports from correct locations
    expect(source).toContain("from '../components/pipeline/FilterBlock.svelte'");
    expect(source).toContain("from '../components/pipeline/MixerBlock.svelte'");
    expect(source).toContain("from '../components/pipeline/ProcessorBlock.svelte'");
    expect(source).toContain("from '../lib/pipelineViewModel'");
  });

  it('uses buildPipelineViewModel to transform config', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify buildPipelineViewModel is imported and used with stable IDs
    expect(source).toContain('buildPipelineViewModel');
    expect(source).toContain('buildPipelineViewModel($dspConfig, getBlockId)');
  });

  it('reads from dspStore for connection state and config', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify imports from dspStore
    expect(source).toContain("from '../state/dspStore'");
    expect(source).toContain('connectionState');
    expect(source).toContain('dspConfig');
    
    // Verify reactive statements use store values
    expect(source).toContain('$dspConfig');
    expect(source).toContain('$connectionState');
  });

  it('implements empty state handling', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify empty state messaging
    expect(source).toContain('empty-state');
    expect(source).toContain('Not Connected');
    expect(source).toContain('Empty Pipeline');
  });

  it('implements flow connectors between blocks', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify flow connector structure
    expect(source).toContain('flow-connector');
    expect(source).toContain('flow-line');
    expect(source).toContain('flow-arrow');
  });

  it('uses correct block type discrimination', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'PipelinePage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify block kind discrimination in template
    expect(source).toContain("block.kind === 'filter'");
    expect(source).toContain("block.kind === 'mixer'");
    expect(source).toContain("block.kind === 'processor'");
  });
});
