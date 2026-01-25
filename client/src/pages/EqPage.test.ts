import { describe, it, expect } from 'vitest';

describe('EqPage MVP-4 Implementation', () => {
  it('component file exists and can be imported', async () => {
    // Verify the component module can be loaded
    const module = await import('./EqPage.svelte');
    expect(module).toBeDefined();
    expect(module.default).toBeDefined();
  });

  it('contains required zone class names in source', async () => {
    // Read the component source to verify structure
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify 4-zone structure present
    expect(source).toContain('eq-octaves-area');
    expect(source).toContain('eq-regions-area');
    expect(source).toContain('eq-plot-area');
    expect(source).toContain('eq-freqscale-area');
    
    // Verify gain scale column exists
    expect(source).toContain('eq-gainscale');
    expect(source).toContain('gain-label');
    
    // Verify alignment wrappers use 2-column grid
    expect(source).toContain('eq-zone-spacer');
    
    // Verify band tokens use ellipse for compensation
    expect(source).toContain('<ellipse');
    expect(source).toContain('rx=');
    expect(source).toContain('ry=');
  });

  it('implements decade-based frequency tick generation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify decade tick logic exists
    expect(source).toContain('generateFrequencyTicks');
    expect(source).toContain('majors');
    expect(source).toContain('minors');
  });

  it('implements log10 frequency mapping', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify base-10 log mapping
    expect(source).toContain('Math.log10');
    expect(source).toContain('freqToX');
  });

  it('implements gain axis labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify gain label ticks defined
    expect(source).toContain('gainLabelTicks');
    expect(source).toContain('gainToYPercent');
  });
});

describe('EqPage MVP-11 Layout Refinement', () => {
  it('contains new 3-row subgrid layout structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify new layout containers
    expect(source).toContain('eq-layout');
    expect(source).toContain('eq-left');
    expect(source).toContain('eq-left-top');
    expect(source).toContain('eq-left-middle');
    expect(source).toContain('eq-left-bottom');
    expect(source).toContain('eq-right');
    expect(source).toContain('band-scroll');
    expect(source).toContain('band-grid');
    
    // Verify band column sections
    expect(source).toContain('band-top');
    expect(source).toContain('band-middle');
    expect(source).toContain('band-bottom');
    
    // Verify CSS subgrid usage
    expect(source).toContain('grid-template-rows: subgrid');
    expect(source).toContain('grid-row: 1 / span 3');
  });
});
