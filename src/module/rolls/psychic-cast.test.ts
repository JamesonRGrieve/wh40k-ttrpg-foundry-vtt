import { describe, expect, it } from 'vitest';
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
    focusPower: { characteristic: string; modifier: number };
}

function psychicRoll(system: PowerSystemStub): PsychicRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to exercise updateBaseTarget()
    const rd = Object.create(PsychicRollData.prototype) as PsychicRollData;
    Object.assign(rd, {
        sourceActor: { getCharacteristicFuzzy: (key: string): CharacteristicStub | undefined => CHARACTERISTICS[key] },
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

describe('opposed checks by actor type', () => {
    const baseActor = readRepoFile('src/module/documents/base-actor.ts');
    const acolyte = readRepoFile('src/module/documents/acolyte.ts');

    it('an acolyte target rolls a real characteristic check', () => {
        expect(acolyte).toContain('override async rollCharacteristicCheck(characteristic: string): Promise<D100Roll | null>');
        expect(acolyte).toContain('return this.rollCheck(char.total);');
    });

    it('any other actor type returns a typed null, which applyOpposedCheck tolerates', () => {
        expect(baseActor).toContain('async rollCharacteristicCheck(_characteristic: string): Promise<D100Roll | null>');
        expect(baseActor).toContain("import type D100Roll from '../dice/d100-roll.ts';");
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
