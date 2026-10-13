import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    bandProvenance,
    type BorrowCandidate,
    type DamageBand,
    damageTypeAbbreviation,
    describeDamageProvenance,
    drawDamageTable,
    pickBorrowedWeapon,
    pickDamageTableRow,
    projectDamageTableRows,
    type RawDamageTableResult,
    selectDamageBand,
} from './damage-profile.ts';

/** A band as `damage.bands` authors it. */
function band(maxRange: number | null, formula: string, extra: Partial<DamageBand> = {}): DamageBand {
    return { maxRange, formula, type: 'energy', penetration: 0, bonus: 0, qualities: [], ...extra };
}

/** Three bands shaped like a range-scaled beam weapon: up to 15 m, up to 50 m, beyond. */
const BEAM_BANDS: DamageBand[] = [
    band(15, '1d10', { bonus: 9, penetration: 2 }),
    band(50, '3d10', { bonus: 9, penetration: 8, qualities: ['felling-1'] }),
    band(null, '6d10', { bonus: 12, penetration: 14, qualities: ['felling-2', 'blast-2'] }),
];

describe('selectDamageBand (#608)', () => {
    it.each([
        [0, 0],
        [15, 0],
        [15.5, 1],
        [16, 1],
        [50, 1],
        [51, 2],
        [400, 2],
    ])('a target at %d m uses band %d (inclusive upper bounds)', (distance, index) => {
        expect(selectDamageBand(BEAM_BANDS, distance)?.index).toBe(index);
    });

    it.each([-5, Number.NaN, Number.POSITIVE_INFINITY])('reads an unmeasured distance (%d) as point blank', (distance) => {
        expect(selectDamageBand(BEAM_BANDS, distance)?.index).toBe(0);
    });

    it('returns null when every band is bounded and none reaches the distance', () => {
        const bounded = [band(10, '1d10'), band(20, '2d10')];
        expect(selectDamageBand(bounded, 20)?.index).toBe(1);
        expect(selectDamageBand(bounded, 21)).toBeNull();
    });

    it('returns null for a weapon with no bands', () => {
        expect(selectDamageBand([], 5)).toBeNull();
    });

    it('returns the band itself so its qualities travel with it', () => {
        expect(selectDamageBand(BEAM_BANDS, 60)?.band.qualities).toEqual(['felling-2', 'blast-2']);
    });
});

describe('bandProvenance (#608)', () => {
    it('numbers the band from 1 and records the distances it covers', () => {
        expect(bandProvenance(BEAM_BANDS, 1, 30)).toEqual({ kind: 'band', index: 2, count: 3, minRange: 15, maxRange: 50, distance: 30 });
    });

    it('gives the first band no lower bound and the last no upper bound', () => {
        expect(bandProvenance(BEAM_BANDS, 0, 3)).toMatchObject({ minRange: null, maxRange: 15 });
        expect(bandProvenance(BEAM_BANDS, 2, 90)).toMatchObject({ minRange: 50, maxRange: null });
    });
});

/** A result shaped like a stored `TableResult`. */
function result(range: [number, number], text: string, damageProfile?: RawDamageTableResult['flags']): RawDamageTableResult {
    return { range, text, ...(damageProfile === undefined ? {} : { flags: damageProfile }) };
}

const TABLE: RawDamageTableResult[] = [
    result([41, 70], '<p>One target suffers <b>3d10+10</b> Energy damage.</p>', {
        'wh40k-rpg': { damageProfile: { formula: '3d10', bonus: 10, type: 'energy', penetration: 0 } },
    }),
    result([1, 3], '<p>The engine ruptures.</p>'),
    result([71, 100], '<p>Witch-fire in a sphere.</p>', {
        'wh40k-rpg': { damageProfile: { formula: '2d10', bonus: 5, type: 'energy', qualities: ['blast-10'] } },
    }),
    { text: 'no range' },
];

describe('projectDamageTableRows (#608)', () => {
    it('projects each result to plain text and its damage profile, sorted by range', () => {
        const rows = projectDamageTableRows(TABLE);
        expect(rows.map((r) => r.range)).toEqual([
            [1, 3],
            [41, 70],
            [71, 100],
        ]);
        expect(rows[1]).toEqual({
            range: [41, 70],
            text: 'One target suffers 3d10+10 Energy damage.',
            profile: { formula: '3d10', bonus: 10, type: 'energy', penetration: 0, qualities: [] },
        });
    });

    it('gives a result without a damage profile a null profile (it deals no damage)', () => {
        expect(projectDamageTableRows(TABLE)[0]?.profile).toBeNull();
    });

    it('fills an authored profile missing optional fields with the neutral values', () => {
        expect(projectDamageTableRows([result([1, 1], 'x', { 'wh40k-rpg': { damageProfile: { formula: '1d5' } } })])[0]?.profile).toEqual({
            formula: '1d5',
            bonus: 0,
            type: 'impact',
            penetration: 0,
            qualities: [],
        });
    });

    it('prefers the V14 result description over the legacy text', () => {
        expect(projectDamageTableRows([{ range: [1, 1], text: 'old', description: '<p>new</p>' }])[0]?.text).toBe('new');
    });
});

describe('pickDamageTableRow (#608)', () => {
    const rows = projectDamageTableRows(TABLE);

    it.each([
        [2, 1],
        [41, 41],
        [70, 41],
        [100, 71],
    ])('a total of %d lands on the row starting at %d', (total, start) => {
        expect(pickDamageTableRow(rows, total)?.range[0]).toBe(start);
    });

    it('snaps a total a bonus pushed past the table to the last row', () => {
        expect(pickDamageTableRow(rows, 110)?.range[0]).toBe(71);
    });
});

describe('drawDamageTable (#608)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** A Roll stand-in that always totals `total`. */
    function stubRoll(total: number): void {
        vi.stubGlobal(
            'Roll',
            class {
                total = total;
                async evaluate(): Promise<this> {
                    return Promise.resolve(this);
                }
            },
        );
    }

    it('rolls the table formula and returns the row it lands on', async () => {
        stubRoll(55);
        vi.stubGlobal('fromUuid', async () => Promise.resolve({ name: 'Discharge', formula: '1d100', results: TABLE }));
        const draw = await drawDamageTable('Compendium.wh40k-rpg.x.RollTable.abc');
        expect(draw?.tableName).toBe('Discharge');
        expect(draw?.total).toBe(55);
        expect(draw?.row.profile?.formula).toBe('3d10');
    });

    it('returns null when the table cannot be loaded', async () => {
        stubRoll(55);
        vi.stubGlobal('fromUuid', async () => Promise.resolve(null));
        expect(await drawDamageTable('Compendium.wh40k-rpg.x.RollTable.missing')).toBeNull();
    });

    it('returns null when loading the table throws', async () => {
        stubRoll(55);
        vi.stubGlobal('fromUuid', async () => Promise.reject(new Error('bad uuid')));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await drawDamageTable('nope')).toBeNull();
        warn.mockRestore();
    });
});

/** A candidate weapon with sensible defaults. */
function candidate(id: string, extra: Partial<BorrowCandidate> = {}): BorrowCandidate {
    return { id, hardpoint: '', innate: false, isMelee: false, inUse: false, borrowsDamage: false, ...extra };
}

describe('pickBorrowedWeapon (#608)', () => {
    const host = { id: 'host', identifier: 'sentry-gun' };

    it('mount: finds the weapon whose hardpoint names the host by embedded id', () => {
        const pair = candidate('pair', { hardpoint: 'host' });
        expect(pickBorrowedWeapon('mount', host, [candidate('other'), pair])).toBe(pair);
    });

    it('mount: finds the weapon whose hardpoint names the host by content identifier', () => {
        const pair = candidate('pair', { hardpoint: 'sentry-gun' });
        expect(pickBorrowedWeapon('mount', host, [pair])).toBe(pair);
    });

    it('mount: returns null when nothing is mounted', () => {
        expect(pickBorrowedWeapon('mount', host, [candidate('loose'), candidate('host')])).toBeNull();
    });

    it('mount: a blank identifier never matches an unmounted weapon', () => {
        expect(pickBorrowedWeapon('mount', { id: 'host', identifier: '' }, [candidate('loose')])).toBeNull();
    });

    it('never lends the host itself or a weapon that borrows its own damage', () => {
        const hostWeapon = candidate('host', { hardpoint: 'host', isMelee: true, inUse: true });
        const borrower = candidate('b', { hardpoint: 'host', isMelee: true, inUse: true, borrowsDamage: true });
        expect(pickBorrowedWeapon('mount', host, [hostWeapon, borrower])).toBeNull();
        expect(pickBorrowedWeapon('wielder-melee', host, [hostWeapon, borrower])).toBeNull();
    });

    it('wielder-melee: prefers a fitted melee weapon over an innate strike', () => {
        const innate = candidate('strike', { isMelee: true, innate: true });
        const fist = candidate('fist', { isMelee: true, inUse: true, hardpoint: 'left-arm' });
        expect(pickBorrowedWeapon('wielder-melee', host, [innate, fist])).toBe(fist);
    });

    it('wielder-melee: falls back to the innate strike when nothing is fitted', () => {
        const innate = candidate('strike', { isMelee: true, innate: true });
        const stowed = candidate('sword', { isMelee: true, inUse: false });
        expect(pickBorrowedWeapon('wielder-melee', host, [stowed, innate])).toBe(innate);
    });

    it('wielder-melee: ignores ranged weapons and returns null without a melee weapon', () => {
        expect(pickBorrowedWeapon('wielder-melee', host, [candidate('gun', { inUse: true })])).toBeNull();
    });
});

describe('damageTypeAbbreviation', () => {
    it.each([
        ['energy', 'E'],
        ['explosive', 'X'],
        ['rending', 'R'],
        ['warp', 'W'],
    ])('%s → %s', (type, abbr) => {
        expect(damageTypeAbbreviation(type)).toBe(abbr);
    });
});

describe('describeDamageProvenance (#608)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: {
                localize: (key: string) => key,
                format: (key: string, data: Record<string, string>) => `${key} ${JSON.stringify(data)}`,
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('labels a bounded band with its upper range', () => {
        expect(describeDamageProvenance(bandProvenance(BEAM_BANDS, 1, 30))).toBe(
            'WH40K.Chat.Damage.ProfileBandUpTo {"index":"2","count":"3","distance":"30","max":"50"}',
        );
    });

    it('labels the unbounded last band with its lower range', () => {
        expect(describeDamageProvenance(bandProvenance(BEAM_BANDS, 2, 90))).toContain('WH40K.Chat.Damage.ProfileBandBeyond');
    });

    it('labels a single unbounded band without a range', () => {
        expect(describeDamageProvenance(bandProvenance([band(null, '1d10')], 0, 5))).toContain('WH40K.Chat.Damage.ProfileBandAny');
    });

    it.each([
        [{ kind: 'out-of-band', distance: 500 } as const, 'WH40K.Chat.Damage.ProfileOutOfBand'],
        [{ kind: 'table', tableName: 'Discharge', total: 55, text: '' } as const, 'WH40K.Chat.Damage.ProfileTable'],
        [{ kind: 'table-missing' } as const, 'WH40K.Chat.Damage.ProfileTableMissing'],
        [{ kind: 'mount', weaponName: 'Heavy Bolters' } as const, 'WH40K.Chat.Damage.ProfileMount'],
        [{ kind: 'wielder-melee', weaponName: 'Bloodfist' } as const, 'WH40K.Chat.Damage.ProfileWielderMelee'],
        [{ kind: 'no-borrowed', from: 'mount' } as const, 'WH40K.Chat.Damage.ProfileNoMount'],
        [{ kind: 'no-borrowed', from: 'wielder-melee' } as const, 'WH40K.Chat.Damage.ProfileNoWielderMelee'],
    ])('labels %j', (provenance, key) => {
        expect(describeDamageProvenance(provenance)).toContain(key);
    });
});
