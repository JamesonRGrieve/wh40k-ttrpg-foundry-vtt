/**
 * Shared test factory for a complete {@link DynamicModifierEntry} (every field
 * populated), so roll / damage tests author a hook by stating only what matters to
 * the case. Defaults to an attacker-side, always-firing, additive `damage` hook
 * worth 0 with no scaling. Lives under `src/module/testing/` (not `tests/lib/`) so
 * co-located `src/**` tests can import it under the main tsconfig's `rootDir`.
 */

import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';

/** A complete `scale` descriptor (unscaled by default) with overrides. */
export function hookScale(overrides: Partial<DynamicModifierEntry['scale']> = {}): DynamicModifierEntry['scale'] {
    return { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null, ...overrides };
}

/** A complete dynamic-modifier hook with overrides. */
export function makeDynamicHook(overrides: Partial<DynamicModifierEntry> = {}): DynamicModifierEntry {
    return {
        target: 'damage',
        targetKey: '',
        side: 'attacker',
        mode: 'add',
        value: 0,
        valueFormula: '',
        scale: hookScale(),
        when: 'always',
        condition: '',
        conditionValue: '',
        duration: {
            unit: 'instant',
            value: 0,
            valueFormula: '',
            sustained: false,
            upkeep: '',
            stacking: 'none',
            uses: 0,
            save: { characteristic: '', difficulty: 0 },
            aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
        },
        formula: '',
        label: '',
        ...overrides,
    };
}
