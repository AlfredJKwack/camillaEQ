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
    
    // Verify EqTokensLayer component is used (tokens now in separate component)
    expect(source).toContain('EqTokensLayer');
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

describe('EqPage MVP-12 Informative Tokens', () => {
  it('uses EqTokensLayer component', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify EqTokensLayer component is used
    expect(source).toContain('EqTokensLayer');
    expect(source).toContain('on:tokenPointerDown');
    expect(source).toContain('on:tokenPointerMove');
    expect(source).toContain('on:tokenPointerUp');
    expect(source).toContain('on:tokenWheel');
  });

  it('EqTokensLayer contains token enhancement elements', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const tokensLayerPath = path.join(__dirname, '../ui/tokens/EqTokensLayer.svelte');
    const source = fs.readFileSync(tokensLayerPath, 'utf-8');

    // Verify token group and decorative elements
    expect(source).toContain('token-group');
    expect(source).toContain('token-halo');
    expect(source).toContain('token-arc');
    expect(source).toContain('token-index');
    expect(source).toContain('token-label-freq');
    expect(source).toContain('token-label-q');
    
    // Verify imports from tokenUtils
    expect(source).toContain('formatTokenFrequency');
    expect(source).toContain('formatTokenQ');
    expect(source).toContain('qToSweepDeg');
    expect(source).toContain('describeEllipseArcPath');
    expect(source).toContain('labelShiftFactor');
    
    // Verify single group transform for scaling compensation (circles instead of ellipses)
    expect(source).toContain('tokenTransform');
    expect(source).toContain('transform={tokenTransform}');
    
    // Verify we now use circles instead of ellipses (perfect circles in local coords)
    expect(source).toContain('<circle');
    expect(source).toContain('r={');
  });
});
