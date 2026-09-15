import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B verification of the Adeptus Astartes Dreadnought loadout/profile
 * repair (system #572 + content #27), against the REAL compiled compendium.
 *
 * Unit tests cover the DataModel in isolation and Storybook renders the craft
 * templates with hand-built context, but neither exercises the full path:
 * compendium _source → migration → hydration → CraftActorSheet._prepareHardpoints
 * → rendered DOM. This creates the actual Dreadnought from its pack and asserts
 * the user-visible fixes end to end:
 *   - manoeuverability / carrying capacity print "—" (null), not 0;
 *   - profile characteristics carry source markers (S/Ag fixed, T na, WS/BS/…
 *     pilot) so the sheet prints * / — instead of a false 0;
 *   - size resolves to "Enormous" and the description is non-empty;
 *   - three named hardpoints exist and weapons carry mount categories / innate;
 *   - Walker / Combat Walker / Reinforced Hull embed as trait ITEMS (not a
 *     plaintext blob) and render in the combat tab with no "[object Object]".
 *
 * NOTE: the embedded traits' compendium DESCRIPTIONS do not yet render — a
 * pre-existing general hydration defect (a lean embed's schema-default empty
 * system clobbers the canonical body on join). Tracked separately; the trait
 * items themselves (the #7 structural requirement) are asserted here.
 */

interface WeaponInfo {
    name: string;
    cat: string;
    innate: boolean;
}
interface ProbeData {
    manoeuverability: number | null;
    carryingCapacity: number | null;
    manoeuverabilityLabel: string;
    carryingCapacityLabel: string;
    sizeLabel: string;
    descriptionLen: number;
    strengthBase: number | undefined;
    strengthSource: string | undefined;
    toughnessSource: string | undefined;
    wsSource: string | undefined;
    hardpointIds: string[];
    weapons: WeaponInfo[];
    traitNames: string[];
}
interface ProbeResult {
    error: string | null;
    data: ProbeData | null;
    rendered: boolean;
    hasLeftArm: boolean;
    hasObjectObject: boolean;
    domHasReinforcedHull: boolean;
    domHasCombatWalker: boolean;
}

test('Adeptus Astartes Dreadnought loads with hardpoints, pilot/N-A profile, and trait items (#572/#27)', async ({ page }) => {
    await joinOrSkip(page);

    const result = await page.evaluate(async (): Promise<ProbeResult> => {
        const fail = (error: string): ProbeResult => ({
            error,
            data: null,
            rendered: false,
            hasLeftArm: false,
            hasObjectObject: false,
            domHasReinforcedHull: false,
            domHasCombatWalker: false,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals (game/Actor), no repo types available in page.evaluate
        const g = globalThis as unknown as {
            game: {
                packs: {
                    get: (
                        id: string,
                    ) =>
                        | { getIndex: () => Promise<Array<{ _id: string; name: string }>>; getDocument: (id: string) => Promise<{ toObject: () => object }> }
                        | undefined;
                };
            };
            Actor: { create: (data: object) => Promise<ActorProbe | null> };
        };
        interface ItemProbe {
            type: string;
            name: string;
            system: { mountCategory?: string; innate?: boolean };
        }
        interface CharProbe {
            base?: number;
            source?: string;
        }
        interface ActorProbe {
            system: {
                manoeuverability: number | null;
                carryingCapacity: number | null;
                manoeuverabilityLabel: string;
                carryingCapacityLabel: string;
                sizeLabel: string;
                description?: { value?: string };
                characteristics: Record<string, CharProbe> | null;
                hardpoints: Array<{ id: string }>;
            };
            items: Iterable<ItemProbe>;
            sheet?: { render: (force: boolean) => Promise<void>; element: HTMLElement | null; close: () => Promise<void> };
            delete: () => Promise<void>;
        }

        const pack = g.game.packs.get('wh40k-rpg.dw-rites-vehicles-terracraft');
        if (pack === undefined) return fail('pack wh40k-rpg.dw-rites-vehicles-terracraft not found');
        const index = await pack.getIndex();
        const entry = index.find((e) => e.name === 'Adeptus Astartes Dreadnought');
        if (entry === undefined) return fail('Dreadnought not in pack index');
        const source = (await pack.getDocument(entry._id)).toObject();

        let actor: ActorProbe | null = null;
        try {
            actor = await g.Actor.create(source);
            if (actor === null) return fail('Actor.create returned null');

            const sheet = actor.sheet;
            let rendered = false;
            let hasLeftArm = false;
            let hasObjectObject = false;
            let domHasReinforcedHull = false;
            let domHasCombatWalker = false;
            if (sheet !== undefined) {
                await sheet.render(true);
                await new Promise<void>((r) => {
                    setTimeout(r, 400);
                });
                const el = sheet.element;
                const html = el instanceof HTMLElement ? el.outerHTML : '';
                rendered = el instanceof HTMLElement;
                hasLeftArm = html.includes('Left Arm');
                hasObjectObject = html.includes('[object Object]');
                domHasReinforcedHull = html.includes('Reinforced Hull');
                domHasCombatWalker = html.includes('Combat Walker');
            }

            const sys = actor.system;
            const chars = sys.characteristics;
            const allItems = Array.from(actor.items);
            const weapons: WeaponInfo[] = allItems
                .filter((it) => it.type === 'weapon')
                .map((it) => {
                    const isys = it.system;
                    return { name: it.name, cat: isys.mountCategory ?? '', innate: isys.innate === true };
                });
            const traitNames: string[] = allItems.filter((it) => it.type === 'vehicleTrait').map((it) => it.name);
            const probeData: ProbeData = {
                manoeuverability: sys.manoeuverability,
                carryingCapacity: sys.carryingCapacity,
                manoeuverabilityLabel: sys.manoeuverabilityLabel,
                carryingCapacityLabel: sys.carryingCapacityLabel,
                sizeLabel: sys.sizeLabel,
                descriptionLen: (sys.description?.value ?? '').length,
                strengthBase: chars?.['strength']?.base,
                strengthSource: chars?.['strength']?.source,
                toughnessSource: chars?.['toughness']?.source,
                wsSource: chars?.['weaponSkill']?.source,
                hardpointIds: sys.hardpoints.map((h) => h.id),
                weapons,
                traitNames,
            };

            return { error: null, data: probeData, rendered, hasLeftArm, hasObjectObject, domHasReinforcedHull, domHasCombatWalker };
        } finally {
            try {
                await actor?.sheet?.close();
                await actor?.delete();
            } catch {
                /* ignore cleanup */
            }
        }
    });

    expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();
    const data = result.data;
    expect(data, 'probe returned no data').not.toBeNull();
    if (data === null) return;

    // Not-applicable stats: null in data, em-dash in the label (never 0).
    expect(data.manoeuverability).toBeNull();
    expect(data.carryingCapacity).toBeNull();
    expect(data.manoeuverabilityLabel).toBe('—');
    expect(data.carryingCapacityLabel).toBe('—');

    // Size + description resolved from the dw line variant.
    expect(data.sizeLabel).toBe('Enormous');
    expect(data.descriptionLen).toBeGreaterThan(0);

    // Profile: fixed chassis stats keep values; pilot / N-A carry their markers.
    expect(data.strengthBase).toBe(70);
    expect(data.strengthSource).toBe('fixed');
    expect(data.toughnessSource).toBe('na');
    expect(data.wsSource).toBe('pilot');

    // Named hardpoints exist.
    expect(data.hardpointIds).toEqual(['left-arm', 'right-arm', 'dccw-auxiliary']);

    // Weapons carry mount categories; the Basic Melee Attack is innate.
    const melee = data.weapons.find((w) => w.name === 'Dreadnought Basic Melee Attack');
    expect(melee?.innate, 'Basic Melee Attack should be innate').toBe(true);
    const lascannon = data.weapons.find((w) => w.name.includes('Lascannons'));
    expect(lascannon?.cat, 'arm weapon should be a dread-weapon').toBe('dread-weapon');
    const stormBolter = data.weapons.find((w) => w.name.includes('Storm Bolter'));
    expect(stormBolter?.cat, 'auxiliary should be a dread-auxiliary').toBe('dread-auxiliary');

    // Special rules are trait ITEMS (not a plaintext blob) and render in the tab.
    expect(data.traitNames).toEqual(expect.arrayContaining(['Walker', 'Combat Walker', 'Reinforced Hull']));
    expect(result.domHasReinforcedHull, 'Reinforced Hull trait should render in the combat tab').toBe(true);
    expect(result.domHasCombatWalker, 'Combat Walker trait should render in the combat tab').toBe(true);

    // The sheet renders, shows the hardpoint, and never prints the raw object.
    expect(result.rendered, 'sheet did not render').toBe(true);
    expect(result.hasLeftArm, 'combat tab should render the Left Arm hardpoint').toBe(true);
    expect(result.hasObjectObject, 'sheet must not render [object Object]').toBe(false);
});
