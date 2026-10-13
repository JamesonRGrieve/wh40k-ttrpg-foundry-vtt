import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_BUCKET } from '../rules/scene-environment.ts';
import { readRepoFile } from '../testing/repo-file.ts';
import { WeaponRollData } from './roll-data';

/** An attacker standing in a scene whose environment flag is `environment`. */
function attackerIn(line: string, environment: object): WeaponRollData['sourceActor'] {
    // eslint-disable-next-line no-restricted-syntax -- test: a synthetic token actor reduced to the surface the environment collector reads (type + token.parent.getFlag)
    return { type: `${line}-character`, token: { parent: { getFlag: () => environment } } } as unknown as WeaponRollData['sourceActor'];
}

function attack(line: string, environment: object, baseCharacteristicKey: string): WeaponRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the environment fold
    const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
    rd.modifiers = {};
    rd.expandedBuckets = {};
    rd.modifierSources = [];
    rd.sourceActor = attackerIn(line, environment);
    rd.baseCharacteristicKey = baseCharacteristicKey;
    return rd;
}

describe('WeaponRollData scene-environment modifiers (Path B, #604)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('harsh conditions: a BS attack takes −20 as a sourced Environment row on the card', () => {
        const rd = attack('dh2', { harshConditions: true }, 'ballisticSkill');
        rd.applyEnvironmentModifiers();
        expect(rd.modifiers[ENVIRONMENT_BUCKET]).toBe(-20);
        rd.buildModifierSources();
        expect(rd.modifierSources.map((c) => [c.label, c.value, c.source])).toEqual([['WH40K.Environment.Weather.Harsh', -20, 'WH40K.Environment.Source']]);
    });

    it('a WS attack takes it in every line', () => {
        for (const line of ['dh1', 'rt', 'dw', 'bc', 'ow']) {
            const rd = attack(line, { harshConditions: true }, 'weaponSkill');
            rd.applyEnvironmentModifiers();
            expect(rd.modifiers[ENVIRONMENT_BUCKET]).toBe(-20);
        }
    });

    it('a Knock Down (a Strength test), calm weather, or an unmodelled line take nothing', () => {
        const knockDown = attack('dh2', { harshConditions: true }, 'strength');
        knockDown.applyEnvironmentModifiers();
        expect(knockDown.modifiers[ENVIRONMENT_BUCKET]).toBe(0);
        expect(knockDown.expandedBuckets[ENVIRONMENT_BUCKET]).toEqual([]);
        const calm = attack('dh2', { gravity: 'zero' }, 'weaponSkill');
        calm.applyEnvironmentModifiers();
        expect(calm.modifiers[ENVIRONMENT_BUCKET]).toBe(0);
        const im = attack('im', { harshConditions: true }, 'weaponSkill');
        im.applyEnvironmentModifiers();
        expect(im.modifiers[ENVIRONMENT_BUCKET]).toBe(0);
    });

    it('is folded on every update, after the base characteristic is known', () => {
        const source = readRepoFile('src/module/rolls/roll-data.ts');
        const update = source.slice(source.indexOf('    update(): void {', source.indexOf('class WeaponRollData')));
        expect(update.indexOf('this.applyEnvironmentModifiers()')).toBeGreaterThan(update.indexOf('this.updateBaseTarget()'));
        expect(update.indexOf('this.applyEnvironmentModifiers()')).toBeLessThan(update.indexOf('this.displayTarget ='));
    });
});
