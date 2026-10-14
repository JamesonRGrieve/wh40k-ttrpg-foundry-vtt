/**
 * Chat-card view models for the RT ship assault actions (ramming, boarding,
 * Hit and Run).
 *
 * Every test and every damage total reaches the card as its full derivation —
 * base ± each component = total — with each component row hoverable to its
 * provenance through the shared `wh40k-tooltip` "modifier" type. The rules
 * layer names components by langpack key; this module localizes them through
 * an injected {@link Localize} so the builders stay unit-testable.
 */

import { degreesResultFormula } from '../../rolls/roll-helpers.ts';
import type { ShipTestComponent, ShipTestResult } from '../../rules/ship-assault.ts';

/** Localize a langpack key, formatting it with `data` when given. */
export type Localize = (key: string, data?: Readonly<Record<string, string | number>>) => string;

/** One hoverable component row, in the shape `modifier-breakdown.hbs` reads. */
export interface AssaultComponentRow {
    label: string;
    value: number;
    source: string;
    /** JSON payload for `data-wh40k-tooltip-data` (the "modifier" tooltip type). */
    tooltipData: string;
}

/** A rolled test as the `ship-assault-test.hbs` partial renders it. */
export interface AssaultTestView {
    title: string;
    baseLabel: string;
    baseTarget: number;
    modifierSources: AssaultComponentRow[];
    target: number;
    roll: number;
    success: boolean;
    dos: number;
    dof: number;
    /** The degrees derivation (`2 DoS = ⌊24 ÷ 10⌋ (roll 29 vs target 53)`). */
    degreesFormula: string;
}

/** A damage total as the `ship-assault-damage.hbs` partial renders it. */
export interface AssaultDamageView {
    title: string;
    rows: AssaultComponentRow[];
    total: number;
}

/** Localize one component into a hoverable row citing `source`. */
export function componentRow(component: ShipTestComponent, source: string, localize: Localize): AssaultComponentRow {
    const label = localize(component.labelKey, component.data);
    return {
        label,
        value: component.value,
        source,
        tooltipData: JSON.stringify({ title: label, sources: [{ name: source, value: component.value }] }),
    };
}

/** Build the view of one rolled test. `source` is the rule citation shown on hover. */
export function buildTestView(title: string, result: ShipTestResult, source: string, localize: Localize): AssaultTestView {
    return {
        title,
        baseLabel: localize(result.base.labelKey, result.base.data),
        baseTarget: result.base.value,
        modifierSources: result.modifiers.map((component) => componentRow(component, source, localize)),
        target: result.target,
        roll: result.roll,
        success: result.success,
        dos: result.dos,
        dof: result.dof,
        degreesFormula: shipDegreesFormula(result, localize),
    };
}

/**
 * The result side of a ship test's derivation, under the line's degrees
 * method: RT `2 DoS = ⌊24 ÷ 10⌋ (roll 29 vs target 53)`, Gen 2
 * `3 DoS = 1 + 2 (…)`. Shares the roll card's readout and langpack keys.
 */
export function shipDegreesFormula(result: ShipTestResult, localize: Localize): string {
    const printed = result.success ? result.dos : result.dof;
    const count = result.method === 'gen1' ? printed + 1 : printed;
    return degreesResultFormula({ method: result.method, success: result.success, count, roll: result.roll, target: result.target }, localize);
}

/** Build the view of a damage total from its components. */
export function buildDamageView(title: string, components: readonly ShipTestComponent[], source: string, localize: Localize): AssaultDamageView {
    return {
        title,
        rows: components.map((component) => componentRow(component, source, localize)),
        total: components.reduce((total, component) => total + component.value, 0),
    };
}
