import { describe, it, expect } from 'vitest';

describe('EqPage Refactored Structure', () => {
  it('component file exists and can be imported', async () => {
    const module = await import('./EqPage.svelte');
    expect(module).toBeDefined();
    expect(module.default).toBeDefined();
  });

  it('is a composition root with minimal responsibility', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify composition of three main panels
    expect(source).toContain('EqLeftPanel');
    expect(source).toContain('EqRightPanel');
    expect(source).toContain('EqOverlays');
    
    // Verify minimal layout structure
    expect(source).toContain('eq-layout');
    expect(source).toContain('grid-template-columns');
    expect(source).toContain('grid-template-rows: auto 1fr auto');
    
    // Verify DSP initialization logic
    expect(source).toContain('initializeFromConfig');
    expect(source).toContain('connectionState');
    
    // Verify viz options initialization
    expect(source).toContain('initializeVizOptions');
    expect(source).toContain('setupVizOptionsPersistence');
  });

  it('passes required props to child components', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify props passed to EqRightPanel
    expect(source).toContain('bands={$bands}');
    expect(source).toContain('filterNames={$filterNames}');
    expect(source).toContain('bandOrderNumbers={$bandOrderNumbers}');
    expect(source).toContain('selectedBandIndex={$selectedBandIndex}');
    expect(source).toContain('preampGain={$preampGain}');
  });
});

describe('EqLeftPanel Component', () => {
  it('component exists and contains layout zones', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqLeftPanel.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify 4-zone structure present
    expect(source).toContain('eq-octaves-area');
    expect(source).toContain('eq-regions-area');
    expect(source).toContain('eq-freqscale-area');
    
    // Verify it composes EqPlotArea
    expect(source).toContain('EqPlotArea');
    
    // Verify it composes VizOptionsBar
    expect(source).toContain('VizOptionsBar');
    
    // Verify alignment wrappers
    expect(source).toContain('eq-zone-spacer');
  });

  it('implements decade-based frequency tick generation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqLeftPanel.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify decade tick logic imported
    expect(source).toContain('generateFrequencyTicks');
    expect(source).toContain('majors');
  });

  it('uses plot math functions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqLeftPanel.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify plot math imports
    expect(source).toContain('freqToX');
    expect(source).toContain('formatFreq');
    expect(source).toContain('calcOctaveWidths');
    expect(source).toContain('calcRegionWidths');
  });
});

describe('EqPlotArea Component', () => {
  it('component exists and contains plot structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqPlotArea.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify plot structure
    expect(source).toContain('eq-plot-area');
    expect(source).toContain('eq-plot');
    expect(source).toContain('eq-gainscale');
    expect(source).toContain('gain-label');
    expect(source).toContain('spectrum-canvas');
    
    // Verify EqTokensLayer component is used
    expect(source).toContain('EqTokensLayer');
    expect(source).toContain('on:tokenPointerDown');
    expect(source).toContain('on:tokenPointerMove');
    expect(source).toContain('on:tokenPointerUp');
    expect(source).toContain('on:tokenWheel');
  });

  it('uses spectrum viz controller', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqPlotArea.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify spectrum controller usage
    expect(source).toContain('createSpectrumVizController');
    expect(source).toContain('spectrumController');
    expect(source).toContain('setEnabled');
    expect(source).toContain('setSpectrumMode');
    expect(source).toContain('setSmoothingMode');
    expect(source).toContain('setHeatmapConfig');
  });

  it('implements gain axis labels', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqPlotArea.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify gain label ticks defined
    expect(source).toContain('gainLabelTicks');
    expect(source).toContain('gainToYPercent');
  });
});

describe('EqPlotMath Module', () => {
  it('module exists and exports required functions', async () => {
    const module = await import('./eq/plot/eqPlotMath');
    
    expect(module.freqToX).toBeDefined();
    expect(module.xToFreq).toBeDefined();
    expect(module.gainToY).toBeDefined();
    expect(module.yToGain).toBeDefined();
    expect(module.gainToYPercent).toBeDefined();
    expect(module.generateFrequencyTicks).toBeDefined();
    expect(module.formatFreq).toBeDefined();
    expect(module.calcOctaveWidths).toBeDefined();
    expect(module.calcRegionWidths).toBeDefined();
  });

  it('implements log10 frequency mapping', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const modulePath = path.join(__dirname, 'eq/plot/eqPlotMath.ts');
    const source = fs.readFileSync(modulePath, 'utf-8');

    // Verify base-10 log mapping
    expect(source).toContain('Math.log10');
  });
});

describe('Layout Refinement (MVP-11)', () => {
  it('EqPage contains 3-row subgrid layout structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'EqPage.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify layout container
    expect(source).toContain('eq-layout');
    expect(source).toContain('grid-template-rows: auto 1fr auto');
  });

  it('EqLeftPanel uses subgrid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/left/EqLeftPanel.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify subgrid structure
    expect(source).toContain('eq-left');
    expect(source).toContain('grid-template-rows: subgrid');
    expect(source).toContain('grid-row: 1 / span 3');
  });

  it('EqRightPanel contains band grid with subgrid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/right/EqRightPanel.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify band grid structure
    expect(source).toContain('band-grid');
    expect(source).toContain('grid-template-rows: subgrid');
    expect(source).toContain('grid-row: 1 / span 3');
  });
});

describe('Informative Tokens (MVP-12)', () => {
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
    
    // Verify transform for scaling compensation
    expect(source).toContain('tokenTransform');
    expect(source).toContain('transform={tokenTransform}');
    
    // Verify we use circles
    expect(source).toContain('<circle');
    expect(source).toContain('r={');
  });
});

describe('Heatmap Controls (MVP-30)', () => {
  it('VizOptionsBar contains group-based structure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/vizOptions/VizOptionsBar.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify group-based structure
    expect(source).toContain('groupContainer');
    expect(source).toContain('groupTitle');
    expect(source).toContain('Spectrum Signal Tap');
    expect(source).toContain('Spectrum Curves');
    expect(source).toContain('Curve Smoothing');
    expect(source).toContain('Heatmap');
    
    // Verify Signal Tap
    expect(source).toContain('sigTapGroup');
    expect(source).toContain('class="tap"');
    expect(source).toContain('data-pos="pre"');
    expect(source).toContain('data-pos="post"');
    
    // Verify waveStack SVG
    expect(source).toContain('waveStack');
    expect(source).toContain('waveSwitch');
    
    // Verify smoothing chip buttons
    expect(source).toContain('class="chip option"');
    
    // Verify heatmap power toggle
    expect(source).toContain('heatmapToggle');
    expect(source).toContain('class="halo"');
    
    // Verify disclosure chip
    expect(source).toContain('disclosureChip');
    expect(source).toContain('toggleHeatmapSettings');
  });

  it('EqOverlays contains HeatmapSettings', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const componentPath = path.join(__dirname, 'eq/EqOverlays.svelte');
    const source = fs.readFileSync(componentPath, 'utf-8');

    // Verify HeatmapSettings component
    expect(source).toContain('HeatmapSettings');
    expect(source).toContain('heatmapSettingsState');
    expect(source).toContain('heatmapMaskMode');
    expect(source).toContain('heatmapHighPrecision');
    expect(source).toContain('heatmapAlphaGamma');
    expect(source).toContain('heatmapMagnitudeGain');
    expect(source).toContain('heatmapGateThreshold');
    expect(source).toContain('heatmapMaxAlpha');
  });
});

describe('Overlay State Management', () => {
  it('eqUiOverlayStore exports overlay functions', async () => {
    const module = await import('../state/eqUiOverlayStore');
    
    expect(module.showFaderTooltip).toBeDefined();
    expect(module.hideFaderTooltip).toBeDefined();
    expect(module.updateFaderTooltipPosition).toBeDefined();
    expect(module.openFilterTypePicker).toBeDefined();
    expect(module.closeFilterTypePicker).toBeDefined();
    expect(module.toggleHeatmapSettings).toBeDefined();
    expect(module.closeHeatmapSettings).toBeDefined();
  });
});
