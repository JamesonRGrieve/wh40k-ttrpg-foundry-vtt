/**
 * Untrained-skill and alternate-characteristic resolution
 * (core.md §"Untrained Skill Use", p. 95, and individual skill
 * descriptors' "Special Uses" sub-sections).
 *
 * - **Untrained Basic skills:** roll against the listed characteristic.
 * - **Untrained Advanced skills:** RAW says characters cannot use them
 *   at all without training. The dialog should refuse to surface the
 *   roll; this module flags via `untrainedAdvanced` for consumers that
 *   want a fallback (e.g. desperate retry at characteristic ÷ 2).
 * - **Untrained non-Basic skills:** the older DH1/RT convention is
 *   characteristic ÷ 2 for an untrained roll; DH2 RAW removes the
 *   halving for Basic skills but keeps the spirit for certain
 *   non-Basic edge cases. This helper offers the halving as an
 *   optional toggle, off by default for DH2.
 * - **Alternate characteristic:** several skill descriptors list a
 *   different characteristic for specific use cases (e.g. Athletics
 *   with Toughness for marathon endurance). The dialog surfaces these
 *   as an override dropdown.
 */

export interface UntrainedTestInput {
    /** Skill rank advance: 0 = untrained, >0 = trained at some tier. */
    advance: number;
    /** Whether the skill descriptor flags itself as Basic. */
    isBasic: boolean;
    /** Characteristic total to roll against. */
    characteristicTotal: number;
    /** Optional override characteristic for the test (alt-char). Caller computes the override total. */
    altCharacteristicTotal?: number;
    /** Apply the optional non-Basic halving penalty (DH1/RT carryover). */
    halveOnNonBasic?: boolean;
}

export interface UntrainedTestOutput {
    /** Effective target value. */
    target: number;
    /** True if RAW disallows the untrained advanced roll entirely. */
    untrainedAdvanced: boolean;
    /** True if the halving rule fired. */
    halved: boolean;
    /** True if an alternate characteristic was used. */
    usedAltCharacteristic: boolean;
}

export function resolveUntrainedTarget(input: UntrainedTestInput): UntrainedTestOutput {
    const usedAlt = typeof input.altCharacteristicTotal === 'number';
    const base = usedAlt ? input.altCharacteristicTotal ?? 0 : input.characteristicTotal;
    if (input.advance > 0) {
        return { target: base, untrainedAdvanced: false, halved: false, usedAltCharacteristic: usedAlt };
    }
    // Advance is 0 — untrained.
    if (!input.isBasic) {
        // RAW: cannot attempt. Caller decides whether to render the row.
        return { target: 0, untrainedAdvanced: true, halved: false, usedAltCharacteristic: usedAlt };
    }
    // Basic untrained: roll at full characteristic in DH2, halved if the
    // caller opted in (older-edition carryover).
    if (input.halveOnNonBasic === true) {
        return { target: Math.floor(base / 2), untrainedAdvanced: false, halved: true, usedAltCharacteristic: usedAlt };
    }
    return { target: base, untrainedAdvanced: false, halved: false, usedAltCharacteristic: usedAlt };
}
