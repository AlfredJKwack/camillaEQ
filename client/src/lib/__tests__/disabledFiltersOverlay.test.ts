/**
 * Disabled filters overlay tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStepKey,
  markFilterDisabled,
  markFilterEnabled,
  clearDisabledFilters,
  getDisabledFiltersForStep,
  remapDisabledFiltersAfterPipelineReorder,
} from '../disabledFiltersOverlay';

describe('disabledFiltersOverlay', () => {
  beforeEach(() => {
    clearDisabledFilters();
  });

  afterEach(() => {
    clearDisabledFilters();
  });

  describe('getStepKey', () => {
    it('generates consistent step key from channels and index', () => {
      const key1 = getStepKey([0, 1], 2);
      const key2 = getStepKey([1, 0], 2); // Different order, should be same
      
      expect(key1).toBe('Filter:ch0,1:idx2');
      expect(key2).toBe('Filter:ch0,1:idx2');
    });
  });

  describe('mark and retrieve disabled filters', () => {
    it('can mark filter as disabled and retrieve it', () => {
      const stepKey = getStepKey([0], 0);
      
      markFilterDisabled('FilterA', stepKey, 1);
      
      const disabled = getDisabledFiltersForStep(stepKey);
      expect(disabled).toHaveLength(1);
      expect(disabled[0].filterName).toBe('FilterA');
      expect(disabled[0].index).toBe(1);
    });

    it('can mark multiple filters as disabled', () => {
      const stepKey = getStepKey([0], 0);
      
      markFilterDisabled('FilterA', stepKey, 0);
      markFilterDisabled('FilterB', stepKey, 2);
      
      const disabled = getDisabledFiltersForStep(stepKey);
      expect(disabled).toHaveLength(2);
      expect(disabled.map(d => d.filterName)).toEqual(['FilterA', 'FilterB']);
    });

    it('can re-enable filter', () => {
      const stepKey = getStepKey([0], 0);
      
      markFilterDisabled('FilterA', stepKey, 1);
      markFilterEnabled('FilterA');
      
      const disabled = getDisabledFiltersForStep(stepKey);
      expect(disabled).toHaveLength(0);
    });
  });

  describe('remapDisabledFiltersAfterPipelineReorder', () => {
    it('remaps step indices when moving step down (fromIndex < toIndex)', () => {
      // Setup: two Filter steps with disabled filters
      // Step 0: FilterA disabled at index 1
      // Step 1: FilterB disabled at index 0
      // Step 2: FilterC disabled at index 2
      markFilterDisabled('FilterA', 'Filter:ch0:idx0', 1);
      markFilterDisabled('FilterB', 'Filter:ch1:idx1', 0);
      markFilterDisabled('FilterC', 'Filter:ch2:idx2', 2);
      
      // Move step 0 to position 2 (between step 1 and 2)
      // Expected: step 0 → idx2, step 1 → idx0, step 2 → idx1
      remapDisabledFiltersAfterPipelineReorder(0, 2);
      
      const disabledA = getDisabledFiltersForStep('Filter:ch0:idx2');
      const disabledB = getDisabledFiltersForStep('Filter:ch1:idx0');
      const disabledC = getDisabledFiltersForStep('Filter:ch2:idx1');
      
      expect(disabledA).toHaveLength(1);
      expect(disabledA[0].filterName).toBe('FilterA');
      
      expect(disabledB).toHaveLength(1);
      expect(disabledB[0].filterName).toBe('FilterB');
      
      expect(disabledC).toHaveLength(1);
      expect(disabledC[0].filterName).toBe('FilterC');
    });

    it('remaps step indices when moving step up (fromIndex > toIndex)', () => {
      // Setup: three Filter steps with disabled filters
      markFilterDisabled('FilterA', 'Filter:ch0:idx0', 0);
      markFilterDisabled('FilterB', 'Filter:ch1:idx1', 1);
      markFilterDisabled('FilterC', 'Filter:ch2:idx2', 2);
      
      // Move step 2 to position 0
      // Expected: step 0 → idx1, step 1 → idx2, step 2 → idx0
      remapDisabledFiltersAfterPipelineReorder(2, 0);
      
      const disabledA = getDisabledFiltersForStep('Filter:ch0:idx1');
      const disabledB = getDisabledFiltersForStep('Filter:ch1:idx2');
      const disabledC = getDisabledFiltersForStep('Filter:ch2:idx0');
      
      expect(disabledA).toHaveLength(1);
      expect(disabledA[0].filterName).toBe('FilterA');
      
      expect(disabledB).toHaveLength(1);
      expect(disabledB[0].filterName).toBe('FilterB');
      
      expect(disabledC).toHaveLength(1);
      expect(disabledC[0].filterName).toBe('FilterC');
    });

    it('no-op when fromIndex === toIndex', () => {
      markFilterDisabled('FilterA', 'Filter:ch0:idx0', 1);
      
      remapDisabledFiltersAfterPipelineReorder(0, 0);
      
      const disabled = getDisabledFiltersForStep('Filter:ch0:idx0');
      expect(disabled).toHaveLength(1);
      expect(disabled[0].filterName).toBe('FilterA');
    });

    it('preserves filters in steps outside the reorder range', () => {
      // Setup: disabled filters at indices 0, 3, 5
      markFilterDisabled('FilterA', 'Filter:ch0:idx0', 0);
      markFilterDisabled('FilterB', 'Filter:ch1:idx3', 1);
      markFilterDisabled('FilterC', 'Filter:ch2:idx5', 2);
      
      // Move step 1 to 2 (only affects steps 1 and 2)
      remapDisabledFiltersAfterPipelineReorder(1, 2);
      
      // Step 0 should be unchanged
      const disabledA = getDisabledFiltersForStep('Filter:ch0:idx0');
      expect(disabledA).toHaveLength(1);
      expect(disabledA[0].filterName).toBe('FilterA');
      
      // Step 5 should be unchanged
      const disabledC = getDisabledFiltersForStep('Filter:ch2:idx5');
      expect(disabledC).toHaveLength(1);
      expect(disabledC[0].filterName).toBe('FilterC');
    });

    it('handles multiple disabled filters in a single step', () => {
      // Setup: multiple disabled filters in step 1
      markFilterDisabled('FilterA', 'Filter:ch0:idx1', 0);
      markFilterDisabled('FilterB', 'Filter:ch0:idx1', 2);
      
      // Move step 1 to 3
      remapDisabledFiltersAfterPipelineReorder(1, 3);
      
      const disabled = getDisabledFiltersForStep('Filter:ch0:idx3');
      expect(disabled).toHaveLength(2);
      expect(disabled.map(d => d.filterName).sort()).toEqual(['FilterA', 'FilterB']);
    });
  });
});
