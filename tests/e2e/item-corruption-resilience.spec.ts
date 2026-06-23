import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B regression for the 2026-05 "empty inventories" incident on the live
 * Solenne PCs. Owned items had been imported with (a) an invalid `type`/`class`
 * enum (e.g. armour `"basic"`, weapon `"low-tech"`) and (b) raw multi-system
 * compendium blobs (`type: { dh2: "las", … }`). Under V14 strict validation each
 * such item failed `_initialize` and was dropped from the actor — silently
 * emptying the inventory.
 *
 * This asserts the DataModel `_migrateData` now (1) flattens per-line variant
 * containers to the active line and (2) coerces an invalid enum to the schema
 * default, so the item LOADS (is not dropped) and renders on the Equipment tab.
 */

interface ItemSystem {
    class?: string;
    type?: string;
    reload?: string;
    discipline?: string;
}
interface ItemDoc {
    id?: string;
    name?: string;
    type?: string;
    system?: ItemSystem;
}
interface ItemSource {
    name: string;
    type: string;
    system: Record<string, string | { dh2: string }>;
}
interface SheetRef {
    render?: (force?: boolean) => Promise<void>;
    close?: () => Promise<void>;
    element?: HTMLElement | null;
}
interface ActorDoc {
    id?: string;
    items?: { size: number; contents: ItemDoc[] };
    sheet?: SheetRef;
    createEmbeddedDocuments?: (type: string, data: ItemSource[]) => Promise<ItemDoc[]>;
    delete?: () => Promise<void>;
}
interface ActorStatic {
    create: (data: { name: string; type: string }) => Promise<ActorDoc>;
}

interface ProbeResult {
    created: number;
    liveCount: number;
    allNamedPresent: boolean;
    weaponLowTechType: string | undefined;
    weaponBlobType: string | undefined;
    weaponReload: string | undefined;
    armourBasicType: string | undefined;
    psychicDiscipline: string | undefined;
    backpackRows: number;
    pageErrors: string[];
}

const VALID_WEAPON_TYPES = [
    'primitive',
    'las',
    'solid-projectile',
    'bolt',
    'melta',
    'plasma',
    'flame',
    'launcher',
    'explosive',
    'power',
    'chain',
    'shock',
    'force',
    'exotic',
    'xenos',
];
const VALID_ARMOUR_TYPES = [
    'flak',
    'mesh',
    'carapace',
    'power',
    'light-power',
    'storm-trooper',
    'feudal-world',
    'primitive',
    'xenos',
    'void',
    'enforcer',
    'hostile-environment',
];

async function probe(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const result = await page.evaluate(async (): Promise<Omit<ProbeResult, 'pageErrors'>> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's global `Actor` document class is untyped inside page.evaluate
        const g = globalThis as unknown as { Actor: ActorStatic };
        const actor = await g.Actor.create({ name: 'ZZItemCorruptionTest', type: 'dh2-character' });
        const sources: ItemSource[] = [
            // invalid scalar enum — must be coerced, not dropped
            { name: 'LowTech Blade', type: 'weapon', system: { class: 'melee', type: 'low-tech' } },
            // raw per-line variant blob — must be flattened to the active line then validate
            { name: 'Blob Laspistol', type: 'weapon', system: { class: { dh2: 'pistol' }, type: { dh2: 'las' } } },
            // invalid armour type — must be coerced to a valid choice
            { name: 'Ragged Robes', type: 'armour', system: { type: 'basic' } },
            // typographic reload (en-dash) — production token-drop crash, must coerce
            { name: 'EnDash Pistol', type: 'weapon', system: { class: 'ranged', type: 'las', reload: '–' } },
            // title-case psychic discipline — production token-drop crash, must coerce
            { name: 'TitleCase Power', type: 'psychicPower', system: { discipline: 'Telepathy' } },
            // control: a plain valid item
            { name: 'Plain Sack', type: 'gear', system: {} },
        ];
        const created = (await actor.createEmbeddedDocuments?.('Item', sources)) ?? [];
        const byName = (n: string): ItemDoc | undefined => actor.items?.contents.find((i) => i.name === n);

        let backpackRows = 0;
        const sheet = actor.sheet;
        if (sheet?.render) {
            await sheet.render(true);
            await new Promise<void>((r) => {
                setTimeout(r, 500);
            });
            const root = sheet.element ?? null;
            const equip = root?.querySelector('section[data-tab="equipment"]') ?? root?.querySelector('.tab[data-tab="equipment"]');
            backpackRows = equip?.querySelectorAll('tbody tr').length ?? 0;
            await sheet.close?.();
        }

        const out: Omit<ProbeResult, 'pageErrors'> = {
            created: created.length,
            liveCount: actor.items?.size ?? 0,
            // The drop regression manifests as a created item VANISHING; a valid
            // item may legitimately spawn a companion (e.g. ammo for a ranged
            // weapon), so assert "every source name survives", not an exact count.
            allNamedPresent: sources.every((s) => byName(s.name) !== undefined),
            weaponLowTechType: byName('LowTech Blade')?.system?.type,
            weaponBlobType: byName('Blob Laspistol')?.system?.type,
            weaponReload: byName('EnDash Pistol')?.system?.reload,
            armourBasicType: byName('Ragged Robes')?.system?.type,
            psychicDiscipline: byName('TitleCase Power')?.system?.discipline,
            backpackRows,
        };
        await actor.delete?.();
        return out;
    });
    return { ...result, pageErrors };
}

test('corrupt-enum / multi-system-blob items load and render (not dropped)', async ({ page }) => {
    const joined = await joinAsGM(page);
    expect(joined, 'GM join must succeed').toBe(true);

    const r = await probe(page);

    // None of the 6 items may be dropped — this is the empty-inventory regression.
    expect(r.created, 'all 6 items created').toBe(6);
    expect(r.allNamedPresent, 'every created item still present (none dropped)').toBe(true);
    expect(r.liveCount, 'collection not emptied').toBeGreaterThanOrEqual(6);

    // Invalid enums coerced to valid scalars.
    expect(VALID_WEAPON_TYPES, 'invalid weapon type coerced').toContain(r.weaponLowTechType);
    expect(r.weaponLowTechType, 'low-tech coerced to schema default').toBe('primitive');
    // Per-line blob flattened to the dh2 scalar.
    expect(r.weaponBlobType, 'per-system blob flattened to active line').toBe('las');
    expect(VALID_ARMOUR_TYPES, 'invalid armour type coerced').toContain(r.armourBasicType);
    expect(r.armourBasicType, 'basic coerced to flak').toBe('flak');
    // Typographic reload (en-dash) normalised to the '-' choice, not dropped.
    expect(r.weaponReload, 'en-dash reload coerced to "-"').toBe('-');
    // Title-case psychic discipline lower-cased to its valid choice, not dropped.
    expect(r.psychicDiscipline, 'Telepathy coerced to telepathy').toBe('telepathy');

    // Equipment tab renders rows for the loaded items (3 weapons + armour + gear).
    expect(r.backpackRows, 'inventory renders rows, not empty').toBeGreaterThanOrEqual(5);

    expect(r.pageErrors, 'no client-side render errors').toEqual([]);
});
