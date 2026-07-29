import { beforeAll, describe, expect, it, vi } from 'vitest';
import { calculateAmmoInformation } from './ammo';

// `ammoText` logs through the Foundry `game.wh40k` global; stub the one method
// it reaches so these pure-arithmetic assertions can run without a runtime.
beforeAll(() => {
    vi.stubGlobal('game', { wh40k: { log: () => undefined } });
});

/**
 * Integration cover for the burst wiring in `calculateAmmoInformation` (#510,
 * #511, #512). `auto-fire.test.ts` proves the arithmetic; this proves the roll
 * data actually comes out carrying it — the layer where all three bugs lived.
 */

interface WeaponStub {
    usesAmmo: boolean;
    system: {
        clip: { value: number };
        attack: { rateOfFire: { semi: number; full: number } };
        loadedAmmo?: { fireRateOverride?: number | null };
    };
}

interface RollDataStub {
    action: string;
    weapon: WeaponStub;
    hasAttackSpecial: (name: string) => boolean;
    ammoPerShot: number;
    fireRate: number;
    shotsFired: number;
    ammoUsed: number;
    ammoText: string;
}

function rollData(action: string, weapon: Partial<WeaponStub> = {}, specials: readonly string[] = []): RollDataStub {
    return {
        action,
        weapon: {
            usesAmmo: weapon.usesAmmo ?? true,
            system: {
                clip: { value: weapon.system?.clip.value ?? 100 },
                attack: { rateOfFire: weapon.system?.attack.rateOfFire ?? { semi: 3, full: 6 } },
                ...(weapon.system?.loadedAmmo !== undefined ? { loadedAmmo: weapon.system.loadedAmmo } : {}),
            },
        },
        hasAttackSpecial: (name: string) => specials.includes(name),
        ammoPerShot: 1,
        fireRate: 1,
        shotsFired: 1,
        ammoUsed: 0,
        ammoText: '',
    };
}

/** `calculateAmmoInformation` mutates its argument; the stub is structurally sufficient. */
function calculate(data: RollDataStub): RollDataStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the production signature takes a full WeaponRollData; this stub carries exactly the fields the function reads
    calculateAmmoInformation(data as unknown as Parameters<typeof calculateAmmoInformation>[0]);
    return data;
}

describe('calculateAmmoInformation — bursts', () => {
    it('a full-auto burst expends its rate of fire and caps hits at the same', () => {
        const d = calculate(rollData('Full Auto Burst'));
        expect(d.ammoUsed).toBe(6);
        expect(d.shotsFired).toBe(6);
        expect(d.fireRate).toBe(6);
    });

    it('a semi-auto burst uses the semi entry', () => {
        const d = calculate(rollData('Semi-Auto Burst'));
        expect(d.ammoUsed).toBe(3);
        expect(d.fireRate).toBe(3);
    });

    it('#510: Suppressing Fire expends the burst it fired, not a single round', () => {
        const full = calculate(rollData('Suppressing Fire - Full'));
        expect(full.ammoUsed).toBe(6);
        expect(full.fireRate).toBe(6);

        const semi = calculate(rollData('Suppressing Fire - Semi'));
        expect(semi.ammoUsed).toBe(3);
        expect(semi.fireRate).toBe(3);
    });

    it('#511: Storm doubles the ammunition but leaves the hit ceiling at the rate of fire', () => {
        const stormBolter = { system: { clip: { value: 60 }, attack: { rateOfFire: { semi: 2, full: 4 } } } };
        const d = calculate(rollData('Full Auto Burst', stormBolter, ['Storm']));
        expect(d.ammoUsed).toBe(8);
        expect(d.shotsFired).toBe(8);
        expect(d.fireRate).toBe(4);
    });

    it('#512: a weapon that consumes no ammunition still carries its rate-of-fire ceiling', () => {
        const d = calculate(rollData('Full Auto Burst', { usesAmmo: false }));
        expect(d.fireRate).toBe(6);
        expect(d.ammoUsed).toBe(0);
    });

    it('#512: and on semi too — where it used to be pinned to a single hit', () => {
        const d = calculate(rollData('Semi-Auto Burst', { usesAmmo: false }));
        expect(d.fireRate).toBe(3);
    });

    it('a short clip cuts the burst and the hits together', () => {
        const d = calculate(rollData('Full Auto Burst', { system: { clip: { value: 2 }, attack: { rateOfFire: { semi: 3, full: 6 } } } }));
        expect(d.ammoUsed).toBe(2);
        expect(d.fireRate).toBe(2);
    });

    it('per-shot multipliers reduce how many shots the clip affords', () => {
        // Twin-Linked doubles the ammunition per shot, so a 6-round burst needs 12.
        const d = calculate(rollData('Full Auto Burst', { system: { clip: { value: 8 }, attack: { rateOfFire: { semi: 3, full: 6 } } } }, ['Twin-Linked']));
        expect(d.ammoPerShot).toBe(2);
        expect(d.shotsFired).toBe(4); // floor(8 / 2)
        expect(d.ammoUsed).toBe(8);
        expect(d.fireRate).toBe(4);
    });

    it("a chambered round's fire-rate override re-rates the weapon for both shots and hits", () => {
        const d = calculate(
            rollData('Full Auto Burst', {
                system: { clip: { value: 100 }, attack: { rateOfFire: { semi: 3, full: 6 } }, loadedAmmo: { fireRateOverride: 1 } },
            }),
        );
        expect(d.shotsFired).toBe(1);
        expect(d.fireRate).toBe(1);
        expect(d.ammoUsed).toBe(1);
    });

    it('a standard attack is a single shot', () => {
        const d = calculate(rollData('Standard Attack'));
        expect(d.ammoUsed).toBe(1);
        expect(d.fireRate).toBe(1);
    });
});
