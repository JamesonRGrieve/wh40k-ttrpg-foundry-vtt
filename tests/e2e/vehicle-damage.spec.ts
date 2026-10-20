import type { Page } from '@playwright/test';
import { anyNewCard, awaitCard, cardHtml, messageIds, restoreSettings, setActorFlag, setWorldSettings, snapCard } from './combat-resolution-flow';
import { type HarnessScene, type HarnessTokenSpec, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — the vehicle damage and crit pipeline (content#28), through the real
 * attack path on a live canvas: the targeted action manager opens the roll dialog,
 * its `_systemRoll` resolves the attack with seeded dice, Roll Damage rolls the hit
 * and (auto-apply on) the assign step writes Structural Integrity.
 *
 * The DH2 Chimera Armoured Transport (core p. 191; Front 30 / Side 22 / Rear 16,
 * Structural Integrity 35, Enclosed) faces down the screen at rotation 0; it also
 * carries Reinforced Armour here, which halves Critical damage. The DH2 Wildcat
 * Transport Buggy (Enemies Without) is Open-Topped.
 *
 *   1. An autocannon (3d10+8, Pen 6) from in front meets Front armour (30 − 6), from
 *      behind Rear armour (16 − 6); the attack roll 12 reads 21 on Table 7-29: Hull.
 *   2. The rear hit comes off Structural Integrity on the assign card.
 *   3. With 2 Integrity left, the front hit's 11 is 2 Integrity and 9 Critical,
 *      halved by Reinforced Armour to 5 (rounded up), read on the Hull chart.
 *   4. A frag grenade's Blast on the open Wildcat hits its crewman too; the same
 *      Blast on the enclosed Chimera leaves its crewman sheltered.
 */

const WEAPONS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item';
const AUTOCANNON = `${WEAPONS}.l7M8n9O0p1Q2r3S4`;
const FRAG_GRENADE = `${WEAPONS}.x1Y2z3A4b5C6d7E8`;
const REINFORCED_ARMOUR = 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits.Item.dF8QAP7SfJDMJW1k';
const CHIMERA = { pack: 'wh40k-rpg.dh2-core-vehicles-terracraft', name: 'Chimera Armoured Transport' };
const WILDCAT = { pack: 'wh40k-rpg.dh2-without-vehicles-terracraft', name: 'Wildcat Transport Buggy' };

/** Three autocannon dice of 9 (no Righteous Fury): 27 + 8. */
const AUTOCANNON_DAMAGE: Array<[number, number]> = [
    [9, 10],
    [9, 10],
    [9, 10],
];

interface CraftData {
    type: string;
    system: object;
    items: object[];
    error: string | null;
}

/** A craft's document data from its pack, to create through the harness. */
async function craftFromPack(page: Page, craft: { pack: string; name: string }): Promise<CraftData> {
    return page.evaluate(async (c): Promise<CraftData> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `game.packs`, no repo types available in page.evaluate
        const g = globalThis as unknown as {
            game: {
                packs: {
                    get: (id: string) =>
                        | {
                              getIndex: () => Promise<Array<{ _id: string; name: string }>>;
                              getDocument: (id: string) => Promise<{ toObject: () => { type: string; system: object; items: object[] } }>;
                          }
                        | undefined;
                };
            };
        };
        const pack = g.game.packs.get(c.pack);
        const entry = (await pack?.getIndex())?.find((e) => e.name === c.name);
        if (pack === undefined || entry === undefined) return { type: '', system: {}, items: [], error: `${c.name} not in ${c.pack}` };
        const data = (await pack.getDocument(entry._id)).toObject();
        return { type: data.type, system: data.system, items: data.items, error: null };
    }, craft);
}

interface CraftState {
    integrity: { value: number; max: number; critical: number };
    critDamageMultiplier: number | null;
    crewExposure: string;
}

/** The craft behind a token — the actor an attack on that token damages, linked or not. */
async function craftState(page: Page, tokenId: string): Promise<CraftState> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `canvas`, no repo types available in page.evaluate
        const g = globalThis as unknown as {
            canvas: {
                tokens: {
                    get: (i: string) =>
                        | {
                              actor: {
                                  system: { integrity: CraftState['integrity']; traitEffects: { critDamageMultiplier: number | null; crewExposure: string } };
                              } | null;
                          }
                        | undefined;
                };
            };
        };
        const system = g.canvas.tokens.get(id)?.actor?.system;
        return {
            integrity: system?.integrity ?? { value: -1, max: -1, critical: -1 },
            critDamageMultiplier: system?.traitEffects.critDamageMultiplier ?? null,
            crewExposure: system?.traitEffects.crewExposure ?? '',
        };
    }, tokenId);
}

/** Set the Structural Integrity of the craft behind a token (setup between steps, not the flow under test). */
async function setIntegrity(page: Page, tokenId: string, value: number, critical: number): Promise<void> {
    await page.evaluate(
        async (a) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `canvas`, no repo types available in page.evaluate
            const g = globalThis as unknown as {
                canvas: { tokens: { get: (i: string) => { actor: { update: (d: object) => Promise<object> } | null } | undefined } };
            };
            await g.canvas.tokens.get(a.id)?.actor?.update({ 'system.integrity.value': a.value, 'system.integrity.critical': a.critical });
        },
        { id: tokenId, value, critical },
    );
}

/** The wounds of the creature behind a token. */
async function tokenWounds(page: Page, tokenId: string): Promise<number> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `canvas`, no repo types available in page.evaluate
        const g = globalThis as unknown as {
            canvas: { tokens: { get: (i: string) => { actor: { system: { wounds: { value: number } } } | null } | undefined } };
        };
        return g.canvas.tokens.get(id)?.actor?.system.wounds.value ?? -1;
    }, tokenId);
}

/** The first of an attack's posted cards carrying `control` (the attack card, not its evasion prompt). */
async function cardWith(page: Page, ids: readonly string[], control: string): Promise<string> {
    for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop -- a handful of cards, read in posting order
        if ((await cardHtml(page, id)).includes(control)) return id;
    }
    throw new Error(`no posted card carries ${control}`);
}

/** Give the craft tokens a fixed footprint, so the facings and blast radii in this spec hold. */
async function sizeTokens(page: Page, sceneId: string, tokenIds: readonly string[], size: number): Promise<void> {
    await page.evaluate(
        async (a) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `game.scenes`, no repo types available in page.evaluate
            const g = globalThis as unknown as {
                game: { scenes: { get: (i: string) => { updateEmbeddedDocuments: (t: string, d: object[]) => Promise<object[]> } | undefined } };
            };
            await g.game.scenes.get(a.sceneId)?.updateEmbeddedDocuments(
                'Token',
                a.tokenIds.map((id) => ({ _id: id, width: a.size, height: a.size })),
            );
        },
        { sceneId, tokenIds, size },
    );
}

/** The values a card's vehicle rows print, by row hook (parsed in the page, which has a DOM). */
async function vehicleRows(page: Page, html: string): Promise<Record<string, string>> {
    return page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, 'text/html');
        return Object.fromEntries(
            [...doc.querySelectorAll<HTMLElement>('[data-vehicle-row]')].map((row) => [
                row.dataset['vehicleRow'] ?? '',
                row.querySelector('[data-vehicle-row-value]')?.textContent.trim() ?? '',
            ]),
        );
    }, html);
}

/** Attack the target with the autocannon (roll 12, reversed 21 → Hull), roll its damage and return the damage and assign cards. */
async function autocannonHit(
    page: Page,
    firer: string,
    target: string,
): Promise<{ damage: { id: string; html: string }; assign: { id: string; html: string } }> {
    const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
        firer,
        target,
        weaponName: 'Autocannon',
        faces: [[12, 100]] as Array<[number, number]>,
    });
    // The attack posts its card and the target's evasion prompt; Roll Damage is on the attack card
    // (the GM rolls over the open evasion window).
    const posted = await Promise.all(attack.messageIds.map(async (id) => ({ id, html: await cardHtml(page, id) })));
    const attackCard = posted.find((card) => card.html.includes('roll-control__roll-damage'))?.id ?? attack.messageIds.at(0);
    if (attackCard === undefined) throw new Error(`the autocannon posted no card; notices ${attack.notices.join(' | ')}`);
    const attackHtml = await cardHtml(page, attackCard);
    expect(
        attackHtml,
        `the autocannon hit (card: ${attackHtml
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 600)})`,
    ).toContain('roll-control__roll-damage');
    const before = await messageIds(page);
    await page.evaluate(
        async (a) =>
            globalThis.wh40kAttack.clickInMessage({ messageId: a.id, buttonSelector: '.roll-control__roll-damage', faces: a.faces, expectMessages: 2 }),
        { id: attackCard, faces: AUTOCANNON_DAMAGE },
    );
    const damage = await awaitCard(page, before, 'data-vehicle-row="vehicle-armour"');
    const assign = await awaitCard(page, before, 'data-vehicle-row="vehicle-integrity"');
    return { damage, assign };
}

test.describe.serial('Vehicle damage and crits (Tier B, content#28)', () => {
    test.setTimeout(scaledMs(300_000));

    test('facing armour, Structural Integrity, Reinforced Armour crits and crew exposure to a Blast', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        try {
            const chimera = await craftFromPack(page, CHIMERA);
            const wildcat = await craftFromPack(page, WILDCAT);
            expect(chimera.error, chimera.error ?? '').toBeNull();
            expect(wildcat.error, wildcat.error ?? '').toBeNull();
            const gunner = (name: string, x: number, y: number): HarnessTokenSpec => ({
                key: name,
                name,
                type: 'dh2-character',
                x,
                y,
                items: [leanWeapon('Autocannon', AUTOCANNON, 24), leanWeapon('Frag Grenade', FRAG_GRENADE, 1)],
                system: { gameSystem: 'dh2', characteristics: { ballisticSkill: { base: 60 }, strength: { base: 40 } } },
            });
            const crewman = (name: string, x: number, y: number): HarnessTokenSpec => ({
                key: name,
                name,
                type: 'dh2-npc',
                x,
                y,
                system: { gameSystem: 'dh2', wounds: { max: 12, value: 12 }, characteristics: { agility: { base: 30 } } },
            });
            // 100 px = 1 m. Each craft's token is 2 × 2 m: the Chimera's centre is (700, 500),
            // the front gunner 6.5 m ahead of its nose (down the screen), the rear gunner 4.5 m
            // behind it. Each crewman stands within 3 m of its craft, the gunners outside it.
            const scene: HarnessScene = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1300, tokens }),
                [
                    {
                        key: 'chimera',
                        name: CHIMERA.name,
                        type: chimera.type,
                        x: 600,
                        y: 400,
                        system: chimera.system,
                        items: [...chimera.items, { name: 'Reinforced Armour', type: 'vehicleTrait', _stats: { compendiumSource: REINFORCED_ARMOUR } }],
                    },
                    { key: 'wildcat', name: WILDCAT.name, type: wildcat.type, x: 200, y: 900, system: wildcat.system, items: wildcat.items },
                    gunner('Front Gunner', 700, 1100),
                    gunner('Rear Gunner', 600, 0),
                    crewman('Wildcat Crewman', 400, 1000),
                    crewman('Chimera Crewman', 900, 400),
                ],
            );
            const token = (key: string): string => scene.tokens[key] ?? '';
            const actor = (key: string): string => scene.actors[key] ?? '';
            await sizeTokens(page, scene.sceneId, [token('chimera'), token('wildcat')], 2);
            await setActorFlag(page, actor('Wildcat Crewman'), 'aboard', { vehicleUuid: `Actor.${actor('wildcat')}`, role: 'crew' });
            await setActorFlag(page, actor('Chimera Crewman'), 'aboard', { vehicleUuid: `Actor.${actor('chimera')}`, role: 'passenger' });

            const state = await craftState(page, token('chimera'));
            expect(state.integrity).toEqual({ value: 35, max: 35, critical: 0 });
            expect(state.critDamageMultiplier, 'Reinforced Armour joined from the compendium').toBe(0.5);
            expect(state.crewExposure).toBe('enclosed');
            expect((await craftState(page, token('wildcat'))).crewExposure).toBe('open');

            await page.waitForTimeout(scaledMs(600));
            const frame = await canvasClip(
                page,
                [
                    { x: 650, y: 50 },
                    { x: 750, y: 1150 },
                    { x: 300, y: 1000 },
                    { x: 950, y: 450 },
                ],
                150,
            );
            expect(
                await snap(page, 'vehicle-damage-positions', frame === null ? { selector: '#board', closeWindows: true } : { clip: frame, closeWindows: true }),
            ).not.toBeNull();

            // --- 1. Front versus Rear armour ------------------------------------
            const front = await autocannonHit(page, token('Front Gunner'), token('chimera'));
            const frontRows = await vehicleRows(page, front.damage.html);
            expect(frontRows['vehicle-facing']).toBe('Front');
            expect(frontRows['vehicle-location']).toBe('Hull');
            expect(frontRows['vehicle-armour'], 'Front 30 less Pen 6').toBe('24');
            const frontDamage = Number(frontRows['vehicle-integrity-damage']);
            expect(frontDamage).toBeGreaterThan(0);
            expect(await snapCard(page, 'vehicle-damage-chimera-front-armour', front.damage.id)).not.toBeNull();

            await setIntegrity(page, token('chimera'), 35, 0);
            const rear = await autocannonHit(page, token('Rear Gunner'), token('chimera'));
            const rearRows = await vehicleRows(page, rear.damage.html);
            expect(rearRows['vehicle-facing']).toBe('Rear');
            expect(rearRows['vehicle-armour'], 'Rear 16 less Pen 6').toBe('10');
            const rearDamage = Number(rearRows['vehicle-integrity-damage']);
            expect(rearDamage - frontDamage, 'the rear takes 14 more through its thinner armour').toBe(14);
            expect(await snapCard(page, 'vehicle-damage-chimera-rear-armour', rear.damage.id)).not.toBeNull();

            // --- 2. Structural Integrity loss ------------------------------------
            expect((await vehicleRows(page, rear.assign.html))['vehicle-integrity']).toBe(`35 → ${35 - rearDamage} / 35`);
            await expect.poll(async () => (await craftState(page, token('chimera'))).integrity.value).toBe(35 - rearDamage);
            expect(await snapCard(page, 'vehicle-damage-si-loss', rear.assign.id)).not.toBeNull();

            // --- 3. A crit halved by Reinforced Armour ---------------------------
            await setIntegrity(page, token('chimera'), 2, 0);
            const crit = await autocannonHit(page, token('Front Gunner'), token('chimera'));
            const excess = frontDamage - 2;
            const halved = Math.ceil(excess / 2);
            const critRows = await vehicleRows(page, crit.assign.html);
            expect(critRows['vehicle-excess']).toBe(String(excess));
            expect(critRows['vehicle-crit-multiplier']).toBe(`×0.5 → ${halved}`);
            expect(critRows['vehicle-critical']).toBe(`0 + ${halved} = ${halved}`);
            expect(crit.assign.html).toContain('data-vehicle-row-chart');
            expect(crit.assign.html).toContain('Hull Critical Hit Effects');
            await expect.poll(async () => (await craftState(page, token('chimera'))).integrity).toEqual({ value: 0, max: 35, critical: halved });
            expect(await snapCard(page, 'vehicle-damage-reinforced-crit-halved', crit.assign.id)).not.toBeNull();

            // --- 4. A Blast on an open-topped vehicle hits its crew --------------
            const blast = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: token('Front Gunner'),
                target: token('wildcat'),
                weaponName: 'Frag Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            expect(blast.messageIds.length, `the frag grenade posted a card; notices ${blast.notices.join(' | ')}`).toBeGreaterThan(0);
            const blastCard = await cardWith(page, blast.messageIds, 'roll-control__resolve-area');
            const resolved = await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__resolve-area', faces: [], expectMessages: 1 }),
                blastCard,
            );
            const results = resolved.at(0) ?? '';
            const resultsHtml = await cardHtml(page, results);
            expect(resultsHtml).toContain('Wildcat Crewman');
            expect(resultsHtml).toContain(WILDCAT.name);
            expect(resultsHtml).not.toContain('data-area-sheltered');
            const wildcatCrewWounds = 12;
            const before = await messageIds(page);
            const rolled = await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({
                        messageId: id,
                        buttonSelector: '.roll-control__roll-damage',
                        faces: [
                            [8, 10],
                            [7, 10],
                            [8, 10],
                            [7, 10],
                        ],
                        expectMessages: 1,
                    }),
                results,
            );
            expect(rolled.length).toBeGreaterThan(0);
            // The damage card (its vehicle hit prints the armour row) posts after each hit is auto-applied.
            await expect
                .poll(async () => anyNewCard(page, before, 'data-vehicle-row="vehicle-armour"'), {
                    message: "the Blast's damage card prints the Wildcat's vehicle rows",
                    timeout: scaledMs(30_000),
                })
                .toBe(true);
            const blastDamage = await awaitCard(page, before, 'data-vehicle-row="vehicle-armour"');
            expect(blastDamage.html).toContain('Wildcat Crewman');
            await expect
                .poll(async () => tokenWounds(page, token('Wildcat Crewman')), { message: 'the Blast wounds the open-topped crewman' })
                .toBeLessThan(wildcatCrewWounds);
            expect(await snapCard(page, 'vehicle-damage-blast-open-topped-crew-hit', results)).not.toBeNull();
            expect(await snapCard(page, 'vehicle-damage-blast-open-topped-damage', blastDamage.id)).not.toBeNull();

            // The same Blast on the enclosed Chimera: its passenger is sheltered.
            const sealed = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: token('Rear Gunner'),
                target: token('chimera'),
                weaponName: 'Frag Grenade',
                faces: [[10, 100]] as Array<[number, number]>,
            });
            const sealedCard = await cardWith(page, sealed.messageIds, 'roll-control__resolve-area');
            const sealedResolved = await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__resolve-area', faces: [], expectMessages: 1 }),
                sealedCard,
            );
            const sealedResults = sealedResolved.at(0) ?? '';
            const sealedHtml = await cardHtml(page, sealedResults);
            expect(sealedHtml).toContain('data-area-sheltered');
            expect(sealedHtml).toContain('Chimera Crewman');
            expect(await snapCard(page, 'vehicle-damage-blast-enclosed-crew-sheltered', sealedResults)).not.toBeNull();
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
        }
    });
});
