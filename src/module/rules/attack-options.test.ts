import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import {
    aggregateSituationalDamageEffects,
    type AttackOptionWeapon,
    getAvailableAttackModes,
    getMeleeSpecialOptions,
    getSituationalModifiers,
    MELEE_ATTACK_MODES,
    MELEE_SITUATIONAL_MODIFIERS,
    MELEE_SPECIAL_OPTIONS,
    RANGED_ATTACK_MODES,
    RANGED_SITUATIONAL_MODIFIERS,
} from './attack-options';
import { allCombatActions, combatActionAttackModifier, combatActionCostLabel } from './combat-actions';

describe('attack-options situational modifiers', () => {
    describe('ranged set', () => {
        it('includes Cover at four AP tiers with no to-hit penalty', () => {
            const cover = RANGED_SITUATIONAL_MODIFIERS.filter((m) => m.key.startsWith('cover'));
            expect(cover.map((m) => m.key)).toEqual(['coverLight', 'coverMedium', 'coverHeavy', 'coverSuperior']);
            for (const c of cover) {
                expect(c.modifier).toBe(0);
                expect(c.damageEffect?.coverAP).toBeGreaterThan(0);
            }
            expect(cover.map((c) => c.damageEffect?.coverAP)).toEqual([4, 6, 8, 16]);
        });

        it('includes three Fog/Smoke tiers at −10/−20/−30', () => {
            const fog = RANGED_SITUATIONAL_MODIFIERS.filter((m) => m.key.startsWith('fog'));
            expect(fog.map((m) => m.modifier)).toEqual([-10, -20, -30]);
            for (const f of fog) {
                expect(f.damageEffect).toBeUndefined();
            }
        });

        it('includes Helpless Target at +30 (ranged)', () => {
            const helpless = RANGED_SITUATIONAL_MODIFIERS.find((m) => m.key === 'helplessTarget');
            expect(helpless).toBeDefined();
            expect(helpless?.modifier).toBe(30);
            // RAW: ranged helpless does not force head; melee does.
            expect(helpless?.damageEffect).toBeUndefined();
        });
    });

    describe('melee set', () => {
        it('includes Helpless Target at +30 with forceLocation: Head', () => {
            const helpless = MELEE_SITUATIONAL_MODIFIERS.find((m) => m.key === 'helplessTarget');
            expect(helpless).toBeDefined();
            expect(helpless?.modifier).toBe(30);
            expect(helpless?.damageEffect?.forceLocation).toBe('Head');
        });

        it('includes Higher Ground at +10', () => {
            const hg = MELEE_SITUATIONAL_MODIFIERS.find((m) => m.key === 'higherGround');
            expect(hg).toBeDefined();
            expect(hg?.modifier).toBe(10);
        });
    });

    describe('aggregateSituationalDamageEffects', () => {
        it('sums cover AP across multiple active cover toggles', () => {
            const effect = aggregateSituationalDamageEffects(['coverLight', 'coverMedium'], true);
            expect(effect.coverAP).toBe(4 + 6);
            expect(effect.forceLocation).toBeUndefined();
        });

        it('returns empty object when no effects are active', () => {
            const effect = aggregateSituationalDamageEffects(['prone'], true);
            expect(effect.coverAP).toBeUndefined();
            expect(effect.forceLocation).toBeUndefined();
        });

        it('captures forceLocation from melee helpless', () => {
            const effect = aggregateSituationalDamageEffects(['helplessTarget'], false);
            expect(effect.forceLocation).toBe('Head');
        });

        it('returns no cover AP for ranged helpless (which only modifies to-hit)', () => {
            const effect = aggregateSituationalDamageEffects(['helplessTarget'], true);
            expect(effect.coverAP).toBeUndefined();
            expect(effect.forceLocation).toBeUndefined();
        });
    });

    describe('getSituationalModifiers', () => {
        it('returns the ranged set for isRanged=true', () => {
            expect(getSituationalModifiers(true)).toBe(RANGED_SITUATIONAL_MODIFIERS);
        });
        it('returns the melee set for isRanged=false', () => {
            expect(getSituationalModifiers(false)).toBe(MELEE_SITUATIONAL_MODIFIERS);
        });
    });
});

/** An autogun-like weapon: RoF S/3/10, so every ranged mode is available. */
const AUTO_WEAPON: AttackOptionWeapon = { isRanged: true, system: { attack: { rateOfFire: { semi: 3, full: 10 } } } };

/** The dialog's ranged mode `key` as shown to an actor of `line`. */
function shownRanged(key: string, line: string | undefined): { modifier: number; tooltip: string } | undefined {
    return getAvailableAttackModes(AUTO_WEAPON, line).find((m) => m.key === key);
}

describe('ranged Rate-of-Fire to-hit modifiers (#231, #607)', () => {
    // Standard Attack has no inherent to-hit bonus (#383). DH2 "a Challenging
    // (+0) Ballistic Skill test" / "with a −10 penalty"; DH1
    // "+10" / "+20", and DW and RT print the same.
    it.each([
        ['dh2', 0, -10],
        ['bc', 0, -10],
        ['ow', 0, -10],
        ['dh1', 10, 20],
        ['dw', 10, 20],
        ['rt', 10, 20],
    ] as const)('%s: single shot +0, semi-auto %i, full-auto %i', (line, semi, full) => {
        expect(shownRanged('standard', line)?.modifier).toBe(0);
        expect(shownRanged('semiAuto', line)?.modifier).toBe(semi);
        expect(shownRanged('fullAuto', line)?.modifier).toBe(full);
    });

    // DH1 "(Full Action)", DW / RT "Type: Full Action"; DH2 / BC / OW "Type: Half Action".
    it.each([
        ['dh1', 'Full'],
        ['dw', 'Full'],
        ['rt', 'Full'],
        ['dh2', 'Half'],
        ['bc', 'Half'],
        ['ow', 'Half'],
    ] as const)('%s: the burst cards cost a %s action', (line, cost) => {
        const modes = getAvailableAttackModes(AUTO_WEAPON, line);
        expect(modes.find((m) => m.key === 'semiAuto')?.actionCost).toBe(cost);
        expect(modes.find((m) => m.key === 'fullAuto')?.actionCost).toBe(cost);
        expect(modes.find((m) => m.key === 'standard')?.actionCost).toBe('Half');
    });

    it('every card shows the cost its action has in the registry, falling back to its own', () => {
        const melee: AttackOptionWeapon = { isRanged: false, system: {} };
        for (const line of ['dh1', 'dh2']) {
            for (const mode of [...getAvailableAttackModes(AUTO_WEAPON, line), ...getAvailableAttackModes(melee, line), ...getMeleeSpecialOptions(line)]) {
                expect(mode.actionCost).toBe(
                    combatActionCostLabel(mode.actionName, line) ??
                        [...RANGED_ATTACK_MODES, ...MELEE_ATTACK_MODES, ...MELEE_SPECIAL_OPTIONS].find((m) => m.key === mode.key)?.actionCost,
                );
            }
        }
    });

    it('an unresolved line shows DH2, the family default', () => {
        expect(shownRanged('semiAuto', undefined)?.modifier).toBe(0);
        expect(shownRanged('fullAuto', undefined)?.modifier).toBe(-10);
    });

    it('burst tooltips print no fixed bonus, which differs per line', () => {
        expect(shownRanged('standard', 'dh2')?.tooltip).toContain('+0 to BS');
        expect(shownRanged('semiAuto', 'dh1')?.tooltip).not.toMatch(/[+-]\d+ BS/);
        expect(shownRanged('fullAuto', 'dh1')?.tooltip).not.toMatch(/[+-]\d+ BS/);
    });
});

describe('attack-mode ↔ combat-action modifier consistency (single source, #231, #607)', () => {
    // The dialog DISPLAYS the attack-mode modifier; the roll APPLIES the linked
    // combat action's modifier. Both read `combatActionAttackModifier`, so the card
    // cannot show one number while the roll uses another — exactly how Full-Auto
    // once read +20 while applying 0. Locked per line.
    const lines = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];
    const melee: AttackOptionWeapon = { isRanged: false, system: {} };

    it.each(lines)('every mode shows the modifier its action applies (%s)', (line) => {
        const shown = [...getAvailableAttackModes(AUTO_WEAPON, line), ...getAvailableAttackModes(melee, line), ...getMeleeSpecialOptions(line)];
        expect(shown).toHaveLength(RANGED_ATTACK_MODES.length + MELEE_ATTACK_MODES.length + MELEE_SPECIAL_OPTIONS.length);
        for (const mode of shown) {
            expect(mode.modifier, `${line}: ${mode.key} → ${mode.actionName}`).toBe(combatActionAttackModifier(mode.actionName, line));
        }
    });

    it('non-burst modes keep the registry value in every line', () => {
        const calledShot = allCombatActions().find((a) => a.name === 'Called Shot')?.attack?.modifier;
        for (const line of lines) expect(shownRanged('calledShot', line)?.modifier).toBe(calledShot);
    });
});

describe('opposed melee manoeuvres routed through the #449 engine (#450)', () => {
    const rollData = readRepoFile('src/module/rolls/roll-data.ts');
    const actionData = readRepoFile('src/module/rolls/action-data.ts');

    it('offers Manoeuvre and Disarm as melee special options', () => {
        const keys = MELEE_SPECIAL_OPTIONS.map((o) => o.key);
        expect(keys).toContain('manoeuvre');
        expect(keys).toContain('disarm');
    });

    it('finalize marks Manoeuvre/Disarm opposed (vs WS) alongside Feint/Knock-Down', () => {
        expect(rollData).toContain("this.isManoeuvre = this.action === 'Manoeuvre'");
        expect(rollData).toContain("this.isDisarm = this.action === 'Disarm'");
        expect(rollData).toContain('this.isOpposed = this.isKnockDown || this.isFeint || this.isManoeuvre || this.isDisarm');
    });

    it('resolves their effects, Disarm scaling by the #449 opposed margin', () => {
        expect(actionData).toContain('weaponRollData.isManoeuvre');
        expect(actionData).toContain('weaponRollData.isDisarm');
        expect(actionData).toContain('this.rollData.opposedMargin >= 3');
    });
});
