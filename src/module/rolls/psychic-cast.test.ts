import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { PsychicRollData } from './roll-data.ts';

/**
 * Regressions found by the all-psychic-powers e2e gate (tests/e2e/psychic-powers-all.spec.ts):
 * every live cast threw in the ammo spend before its card posted, every power
 * rolled damage, and the Focus Power test read fields the power schema does not
 * have, so its base was 0 and the printed difficulty was never applied.
 */

interface CharacteristicStub {
    total: number;
    short: string;
}

const CHARACTERISTICS: Record<string, CharacteristicStub> = {
    willpower: { total: 45, short: 'WP' },
    perception: { total: 38, short: 'Per' },
};

interface PowerSystemStub {
    focusPower: { characteristic: string; modifier: number; skill?: string };
}

const SKILLS: Record<string, { current: number; label: string }> = {
    psyniscience: { current: 52, label: 'Psyniscience' },
};

function psychicRoll(system: PowerSystemStub): PsychicRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to exercise updateBaseTarget()
    const rd = Object.create(PsychicRollData.prototype) as PsychicRollData;
    Object.assign(rd, {
        sourceActor: {
            getCharacteristicFuzzy: (key: string): CharacteristicStub | undefined => CHARACTERISTICS[key],
            getSkillFuzzy: (key: string): { current: number; label: string } | undefined => SKILLS[key],
            system: { corruption: 17 },
        },
        targetActor: null,
        power: { name: 'Power', system },
        baseTarget: 0,
        baseChar: '',
    });
    return rd;
}

describe('PsychicRollData.updateBaseTarget — the Focus Power test base', () => {
    it("uses the power's declared focus characteristic", () => {
        const rd = psychicRoll({ focusPower: { characteristic: 'perception', modifier: 0 } });
        rd.updateBaseTarget();
        expect(rd.baseTarget).toBe(38);
        expect(rd.baseChar).toBe('Per');
    });

    it('defaults to Willpower when the power names none', () => {
        const rd = psychicRoll({ focusPower: { characteristic: '', modifier: 0 } });
        rd.updateBaseTarget();
        expect(rd.baseTarget).toBe(45);
        expect(rd.baseChar).toBe('WP');
    });

    it('rolls the declared focus skill instead of the characteristic', () => {
        const rd = psychicRoll({ focusPower: { characteristic: 'willpower', modifier: 0, skill: 'psyniscience' } });
        rd.updateBaseTarget();
        expect(rd.baseTarget).toBe(52);
        expect(rd.baseChar).toBe('Psyniscience');
    });

    describe('a focus key that is no characteristic', () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('tests the numeric actor stat of that name (BC Corruption Test)', () => {
            vi.stubGlobal('game', { i18n: { localize: (key: string): string => key } });
            const rd = psychicRoll({ focusPower: { characteristic: 'corruption', modifier: 0 } });
            rd.updateBaseTarget();
            expect(rd.baseTarget).toBe(17);
            expect(rd.baseChar).toBe('WH40K.Resource.Corruption');
        });
    });
});

describe('the psychic cast path (source contract — action-data cannot load under happy-dom)', () => {
    const actionData = readRepoFile('src/module/rolls/action-data.ts');
    const rollData = readRepoFile('src/module/rolls/roll-data.ts');

    it('only a weapon attack spends ammo; a psychic cast has no weapon', () => {
        const guard = actionData.indexOf('if (this.rollData instanceof WeaponRollData) {');
        const spend = actionData.indexOf('await useAmmo(');
        expect(guard).toBeGreaterThan(-1);
        expect(spend).toBeGreaterThan(guard);
    });

    it('a psychic action rolls damage only for an attack power', () => {
        expect(actionData).toContain('this.hasDamage = this.rollData.hasDamage;');
    });

    it("the focus modifier is the power's printed focusPower.modifier", () => {
        expect(rollData).toContain("this.modifiers['power'] = focusPower?.modifier ?? 0;");
    });

    it('the card enriches the description body, not the description object', () => {
        expect(actionData).toContain('powerSystem.description?.value');
    });

    // The target's quick test is a D100Roll (isSuccess / degreesOfSuccess / target),
    // not a {roll, dos, dof, success} bag — reading `.roll.total` off it threw on
    // every opposed contest that reached it.
    it('every opposed contest reads the target side off its D100Roll in one place', () => {
        expect(actionData).toContain('applyOpposedCheck(check: D100Roll | null)');
        expect(actionData).toContain('roll: check.evaluatedTotal');
        expect(actionData).not.toContain('rollCheck.roll.total');
        expect(actionData.match(/this\.applyOpposedCheck\(await /g)).toHaveLength(3);
    });
});

describe('the psychic power schema the content session authors against', () => {
    const power = readRepoFile('src/module/data/item/psychic-power.ts');
    const damage = readRepoFile('src/module/data/shared/damage-template.ts');

    // Each field below was silently dropped (or absent) before, so the authored
    // value never reached a cast: range (stripped), a skill focus test, a
    // PR-valued penetration, and the no-mechanic marker the gate exempts.
    it.each([
        ['range: new fields.StringField', power],
        ['skill: new fields.StringField', power],
        ['narrativeEffect: new fields.BooleanField', power],
        ['penetrationFormula: new FormulaField', damage],
    ])('declares %s', (field, source) => {
        expect(source).toContain(field);
    });
});

describe('opposed checks for every actor type', () => {
    const baseActor = readRepoFile('src/module/documents/base-actor.ts');
    const acolyte = readRepoFile('src/module/documents/acolyte.ts');

    // Regression: NPCs inherited a stub returning null, so an NPC could never
    // resist an opposed power. Every actor now rolls a real check on the base class.
    it('the base actor rolls a real characteristic check, so an NPC target resists', () => {
        expect(baseActor).toContain('async rollCharacteristicCheck(characteristic: string): Promise<D100Roll | null>');
        expect(baseActor).toContain('return this.rollCheck(char.total);');
    });

    it('reaches D100Roll at runtime, never by a value import that would close a dependency cycle', () => {
        expect(baseActor).toContain('game.wh40k.D100Roll.quickCheck(this, targetNumber)');
        expect(baseActor).toContain("import type D100Roll from '../dice/d100-roll.ts';");
        expect(acolyte).not.toContain('override async rollCharacteristicCheck');
    });
});

describe('the psychic action card', () => {
    const card = readRepoFile('src/templates/chat/psychic-action-chat.hbs');
    const attackCard = readRepoFile('src/templates/chat/action-roll-chat.hbs');
    const targetRow = readRepoFile('src/templates/chat/partial/card-target-row.hbs');

    it('names the target — on the effect card and the attack card, through one partial', () => {
        const use = 'chat/partial/card-target-row.hbs target=targetActor';
        expect(card).toContain(use);
        expect(attackCard).toContain(use);
        expect(targetRow).toContain('{{target.name}}');
        expect(targetRow).toContain('WH40K.Roll.TargetLabel');
    });

    it('labels the result from the langpack', () => {
        expect(card).toContain('WH40K.Psychic.PowerManifested');
        expect(card).toContain('WH40K.Psychic.PowerFailed');
        expect(card).not.toContain('label="Power');
    });
});
