import { describe, expect, it } from 'vitest';
import { buildLangStub } from '../testing/lang-stub.ts';
import { calculateExoticQualityDamageModifiers, EXOTIC_DAMAGE_MODIFIER_IDS, EXOTIC_DAMAGE_MODIFIER_LABEL_KEYS } from './weapon-quality-effects.ts';

type ExoticContext = Parameters<typeof calculateExoticQualityDamageModifiers>[0];

const weaponWith = (qualities: ReadonlyArray<string>, isMeleeWeapon = false): NonNullable<ExoticContext['weapon']> =>
    ({ system: { special: new Set(qualities), isMeleeWeapon } } as NonNullable<ExoticContext['weapon']>);

const actorWith = (system: object): NonNullable<ExoticContext['actor']> => ({ system } as NonNullable<ExoticContext['actor']>);

/**
 * The exotic quality damage contributions are keyed by stable ids; the
 * English label each one shows under on the damage card is a langpack key,
 * resolved where the card is built — never baked into the map key.
 */
describe('calculateExoticQualityDamageModifiers — stable ids', () => {
    it('files Force under the force id with the Psy Rating', () => {
        const result = calculateExoticQualityDamageModifiers({ weapon: weaponWith(['force']), actor: actorWith({ psyker: { psyRating: 4 } }) });
        expect(result).toEqual({ force: 4 });
    });

    it('files Witch-Edge under the witchEdge id for an Eldar wielder of a melee weapon', () => {
        const result = calculateExoticQualityDamageModifiers({
            weapon: weaponWith(['witch-edge'], true),
            actor: actorWith({ species: 'Eldar', characteristics: { strength: { bonus: 4 } } }),
        });
        expect(result).toEqual({ witchEdge: 4 });
    });

    it('files Daemonbane under the daemonbane id as a dice formula against a Daemon', () => {
        const result = calculateExoticQualityDamageModifiers({
            weapon: weaponWith(['daemonbane']),
            actor: actorWith({}),
            target: actorWith({ species: 'Daemon' }),
        });
        expect(result).toEqual({ daemonbane: '2d10' });
    });

    it('contributes nothing when the quality is absent', () => {
        expect(calculateExoticQualityDamageModifiers({ weapon: weaponWith([]), actor: actorWith({ psyker: { psyRating: 4 } }) })).toEqual({});
    });
});

describe('exotic damage modifier labels', () => {
    it('has a label key for every id, and each resolves to the printed English label', () => {
        const lang = buildLangStub();
        const labels = EXOTIC_DAMAGE_MODIFIER_IDS.map((id) => lang.localize(EXOTIC_DAMAGE_MODIFIER_LABEL_KEYS[id]));
        expect(labels).toEqual(['Force (Psy Rating)', 'Witch-Edge (Extra SB)', 'Daemonbane (vs Daemon)']);
    });
});
