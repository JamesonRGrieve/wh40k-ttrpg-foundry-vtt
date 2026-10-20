import type { Page } from '@playwright/test';
import { anyNewCard, awaitCard, cardHtml, messageIds, restoreSettings, setActorFlag, setWorldSettings, snapCard } from './combat-resolution-flow';
import { type HarnessScene, type HarnessTokenSpec, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { popOutChatMessage, showChatMessage } from './lib/chat-capture';
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
const FLYER = 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits.Item.63b3a3c62d2fe2ad';
const SHIELD_GENERATOR = 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits.Item.RnTjRMnjQEdSHJWJ';
const DAMAGE_CONTROL = 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits.Item.Hw3TrFVysIbUOXt5';
const DAEMON_ENGINE = 'Compendium.wh40k-rpg.hb-generic-items-vehicle-traits-gw-copyright.Item.VbS93F0wE1Q8X4NA';
const FORCE_SWORD = `${WEAPONS}.v3W4x5Y6z7A8b9C0`;
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
    /** Its traits' to-hit penalties, as `<trait>:<value>:<condition>`. */
    incomingToHit: string[];
    elevation: number;
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
                              document: { elevation: number };
                              actor: {
                                  system: {
                                      integrity: CraftState['integrity'];
                                      traitEffects: {
                                          critDamageMultiplier: number | null;
                                          crewExposure: string;
                                          incomingToHit?: Array<{ trait: string; value: number; condition: string }>;
                                      };
                                  };
                              } | null;
                          }
                        | undefined;
                };
            };
        };
        const token = g.canvas.tokens.get(id);
        const system = token?.actor?.system;
        return {
            integrity: system?.integrity ?? { value: -1, max: -1, critical: -1 },
            critDamageMultiplier: system?.traitEffects.critDamageMultiplier ?? null,
            crewExposure: system?.traitEffects.crewExposure ?? '',
            incomingToHit: (system?.traitEffects.incomingToHit ?? []).map((entry) => `${entry.trait}:${entry.value}:${entry.condition}`),
            elevation: token?.document.elevation ?? -1,
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
/** The damage card's action buttons, which once ran past both card edges in the sidebar. */
const DAMAGE_CARD_BUTTONS = '.roll-control__replace-damage-die, .roll-control__assign-damage';

/**
 * In the chat sidebar at its default width, the damage card's Replace Die and Assign
 * Damage buttons sit inside the card and their labels fit their buttons. Snaps the
 * button rows as `label`.
 */
async function expectActionButtonsFit(page: Page, messageId: string, label: string): Promise<void> {
    const message = await showChatMessage(page, messageId);
    const escaped = await page.locator(message).evaluate((el, selector) => {
        const box = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll<HTMLElement>(selector)).map((button) => {
            const rect = button.getBoundingClientRect();
            return { inside: rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5, fits: button.scrollWidth <= button.clientWidth + 1 };
        });
    }, DAMAGE_CARD_BUTTONS);
    expect(escaped, 'the Replace Die and Assign Damage buttons render').toHaveLength(2);
    expect(escaped, 'each button inside the card, its label inside the button').toEqual([
        { inside: true, fits: true },
        { inside: true, fits: true },
    ]);
    // Capture both button rows with the card's edges either side: the union of the rows' boxes, card-wide.
    // Centred in the log, clear of the chat input that overlays its foot.
    await page.locator(`${message} .roll-control__assign-damage`).evaluate((el) => {
        el.scrollIntoView({ block: 'center' });
    });
    await page.evaluate(async () => globalThis.wh40kE2E.settle(200));
    const clip = await page.locator(message).evaluate((el, selector) => {
        const box = el.getBoundingClientRect();
        const rows = Array.from(el.querySelectorAll<HTMLElement>(selector), (button) => (button.parentElement ?? button).getBoundingClientRect());
        const top = Math.min(...rows.map((r) => r.top));
        const bottom = Math.max(...rows.map((r) => r.bottom));
        return { x: box.left - 4, y: top - 4, width: box.width + 8, height: bottom - top + 8 };
    }, DAMAGE_CARD_BUTTONS);
    expect(await snap(page, label, { clip })).not.toBeNull();
}

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

/** A DH2 acolyte with an autocannon and a frag grenade, BS 60. */
function gunner(name: string, x: number, y: number): HarnessTokenSpec {
    return {
        key: name,
        name,
        type: 'dh2-character',
        x,
        y,
        items: [leanWeapon('Autocannon', AUTOCANNON, 24), leanWeapon('Frag Grenade', FRAG_GRENADE, 1)],
        system: { gameSystem: 'dh2', characteristics: { ballisticSkill: { base: 60 }, strength: { base: 40 } } },
    };
}

/** The attack card an autocannon attack posts (the card carrying Roll Damage). */
async function autocannonAttackCard(page: Page, firer: string, target: string): Promise<{ id: string; html: string }> {
    const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
        firer,
        target,
        weaponName: 'Autocannon',
        faces: [[12, 100]] as Array<[number, number]>,
    });
    const id = await cardWith(page, attack.messageIds, 'roll-control__roll-damage');
    return { id, html: await cardHtml(page, id) };
}

/** The hit location an attack card names, and whether it is a vehicle's or a creature's (#682). */
async function attackLocation(page: Page, html: string): Promise<{ kind: string; text: string }> {
    return page.evaluate((source) => {
        const row = new DOMParser().parseFromString(source, 'text/html').querySelector<HTMLElement>('[data-attack-hit-location]');
        return { kind: row?.dataset['attackHitLocation'] ?? '', text: row?.textContent.trim() ?? '' };
    }, html);
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
    // The attack posts its card and the target's evasion prompt; Roll Damage is on the attack card
    // (the GM rolls over the open evasion window).
    const attackCard = (await autocannonAttackCard(page, firer, target)).id;
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

    /**
     * #678: a Flyer's −20 applies only while it is airborne (DH2 Enemies Without
     * p. 53), and an attack from below it reads Rear armour (DH2 Core p. 253). The
     * Chimeras here carry the Flyer trait: one 3 m up, with a gunner 1.6 m ahead of
     * its centre below it, is airborne and attacked from below; one on the ground
     * with a gunner 6.5 m ahead is neither. (3 m keeps the craft inside the scene's
     * default ground level, which V14 tops at four grid units.)
     */
    test('a Flyer is harder to hit only while airborne, and an attack from below meets its Rear armour (#678)', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': false });
        try {
            const chimera = await craftFromPack(page, CHIMERA);
            expect(chimera.error, chimera.error ?? '').toBeNull();
            const flyingCraft = (key: string, x: number, elevation: number): HarnessTokenSpec => ({
                key,
                name: key,
                type: chimera.type,
                x,
                y: 400,
                elevation,
                system: chimera.system,
                items: [...chimera.items, { name: 'Flyer', type: 'vehicleTrait', _stats: { compendiumSource: FLYER } }],
            });
            const scene: HarnessScene = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1300, tokens }),
                [
                    flyingCraft('Airborne Chimera', 200, 3),
                    flyingCraft('Landed Chimera', 900, 0),
                    gunner('Gunner Below', 300, 600),
                    gunner('Gunner Ahead', 950, 1100),
                ],
            );
            const airborneToken = scene.tokens['Airborne Chimera'] ?? '';
            const landedToken = scene.tokens['Landed Chimera'] ?? '';
            await sizeTokens(page, scene.sceneId, [airborneToken, landedToken], 2);
            const flying = await craftState(page, airborneToken);
            expect({ incomingToHit: flying.incomingToHit, elevation: flying.elevation }, 'the Flyer trait joined, and the craft is 3 m up').toEqual({
                incomingToHit: ['Flyer:-20:airborne'],
                elevation: 3,
            });

            // --- Airborne: the Flyer's −20 applies, and from below it reads Rear ----
            const airborne = await autocannonAttackCard(page, scene.tokens['Gunner Below'] ?? '', airborneToken);
            expect(airborne.html, 'the airborne Flyer imposes its −20 on the shot').toContain('Flyer');
            expect(await snapCard(page, 'vehicle-damage-flyer-airborne-attack', airborne.id)).not.toBeNull();
            const before = await messageIds(page);
            await page.evaluate(
                async (a) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: a.id, buttonSelector: '.roll-control__roll-damage', faces: a.faces, expectMessages: 1 }),
                { id: airborne.id, faces: AUTOCANNON_DAMAGE },
            );
            const fromBelow = await awaitCard(page, before, 'data-vehicle-row="vehicle-armour"');
            const rows = await vehicleRows(page, fromBelow.html);
            expect(rows['vehicle-facing'], 'an attack from below reads Rear').toBe('Rear');
            // #682: the attack card names the location its damage card resolves (roll 12 → 21: the Hull).
            expect(await attackLocation(page, airborne.html), 'the attack card names a vehicle location, not "Left Arm"').toEqual({
                kind: 'vehicle',
                text: 'Hull',
            });
            expect(rows['vehicle-location']).toBe('Hull');
            expect(rows['vehicle-armour'], 'Rear 16 less Pen 6').toBe('10');
            expect(fromBelow.html).toContain('Attacked from above or below');
            expect(await snapCard(page, 'vehicle-damage-from-below-rear-armour', fromBelow.id)).not.toBeNull();
            await expectActionButtonsFit(page, fromBelow.id, 'vehicle-damage-from-below-buttons-in-sidebar');

            // --- Landed: no Flyer penalty, and the gunner's bearing reads Front ----
            const landed = await autocannonAttackCard(page, scene.tokens['Gunner Ahead'] ?? '', landedToken);
            expect(landed.html).toContain('roll-control__roll-damage');
            expect(landed.html, 'a landed Flyer imposes no penalty').not.toContain('Flyer');
            expect(await snapCard(page, 'vehicle-damage-flyer-landed-attack', landed.id)).not.toBeNull();
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
        }
    });

    /**
     * #678: a burst's extra hits may move to another target within 2 m that is no
     * harder to hit (DH2 Core p. 254). Spread onto a second Chimera beside the
     * first, its hit strikes that craft as a vehicle — its own facing, location
     * and armour — on a fresh d100 rather than the reversed attack roll.
     */
    test("a burst's extra hit spread onto a second vehicle strikes it as a vehicle (#678)", async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': false });
        try {
            const chimera = await craftFromPack(page, CHIMERA);
            expect(chimera.error, chimera.error ?? '').toBeNull();
            const craft = (key: string, x: number): HarnessTokenSpec => ({
                key,
                name: key,
                type: chimera.type,
                x,
                y: 400,
                system: chimera.system,
                items: chimera.items,
            });
            // The two craft stand side by side, their centres 2 m apart; the gunner is ahead of both.
            const scene: HarnessScene = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1300, tokens }),
                [craft('Lead Chimera', 600), craft('Wing Chimera', 800), gunner('Burst Gunner', 800, 1100)],
            );
            const lead = scene.tokens['Lead Chimera'] ?? '';
            await sizeTokens(page, scene.sceneId, [lead, scene.tokens['Wing Chimera'] ?? ''], 2);
            const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['Burst Gunner'] ?? '',
                target: lead,
                weaponName: 'Autocannon',
                faces: [[12, 100]] as Array<[number, number]>,
                choices: { action: 'Semi-Auto Burst', hitAllocation: 'spread' as const },
            });
            const attackCard = await cardWith(page, attack.messageIds, 'roll-control__roll-damage');
            // #682: the burst's first hit is on the declared craft; the card names its vehicle location.
            const burstLocation = await attackLocation(page, await cardHtml(page, attackCard));
            expect(burstLocation, "the burst card names the lead craft's vehicle location").toEqual({ kind: 'vehicle', text: 'Hull' });
            expect(await snapCard(page, 'vehicle-damage-burst-attack-card-location', attackCard)).not.toBeNull();
            const before = await messageIds(page);
            await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__roll-damage', faces: [], expectMessages: 1 }),
                attackCard,
            );
            const damage = await awaitCard(page, before, 'data-vehicle-row="vehicle-armour"');
            expect(damage.html, 'a hit landed on the wing craft').toContain('Wing Chimera');
            expect(damage.html.split('data-vehicle-row="vehicle-armour"').length - 1, 'every hit, on either craft, is a vehicle hit').toBe(3);
            expect(damage.html, 'the spread hit read a fresh d100').toContain('a fresh d100 for a hit after the attack');
            expect(await snapCard(page, 'vehicle-damage-burst-spread-second-vehicle', damage.id)).not.toBeNull();
            // The card runs past the window; capture the wing craft's hit on its own.
            const popout = await popOutChatMessage(page, damage.id);
            expect(await snap(page, 'vehicle-damage-burst-spread-wing-hit', { selector: `${popout} div.tw-my-3:has-text("Wing Chimera")` })).not.toBeNull();
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
        }
    });

    /**
     * #678: a Shield Generator (Common: overloads on 01–10) stops a hit on a field
     * roll of 06 and overloads; a Force weapon passes a Daemon Engine's field
     * unrolled; and a Damage Control craft's commander re-rolls a Righteous Fury
     * roll on its chart, once.
     */
    test('force-field overload and bypass, and the Damage Control re-roll (#678)', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': false });
        try {
            const chimera = await craftFromPack(page, CHIMERA);
            expect(chimera.error, chimera.error ?? '').toBeNull();
            const craft = (key: string, x: number, trait: { name: string; uuid: string }): HarnessTokenSpec => ({
                key,
                name: key,
                type: chimera.type,
                x,
                y: 400,
                system: chimera.system,
                items: [...chimera.items, { name: trait.name, type: 'vehicleTrait', _stats: { compendiumSource: trait.uuid } }],
            });
            const psyker: HarnessTokenSpec = {
                key: 'Psyker',
                name: 'Psyker',
                type: 'dh2-character',
                x: 700,
                y: 600,
                items: [leanWeapon('Force Sword', FORCE_SWORD, 0)],
                system: { gameSystem: 'dh2', characteristics: { weaponSkill: { base: 60 }, strength: { base: 40 } } },
            };
            // Each craft's centre is 1 m above its gunner's row; the psyker stands at the Daemon Engine's nose.
            const scene: HarnessScene = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.setup({ width: 1600, height: 1300, tokens }),
                [
                    craft('Shielded Chimera', 100, { name: 'Shield Generator', uuid: SHIELD_GENERATOR }),
                    craft('Daemon Chimera', 600, { name: 'Daemon Engine', uuid: DAEMON_ENGINE }),
                    craft('Controlled Chimera', 1100, { name: 'Damage Control', uuid: DAMAGE_CONTROL }),
                    gunner('Shield Gunner', 150, 1100),
                    gunner('Control Gunner', 1150, 1100),
                    psyker,
                ],
            );
            const token = (key: string): string => scene.tokens[key] ?? '';
            await sizeTokens(page, scene.sceneId, [token('Shielded Chimera'), token('Daemon Chimera'), token('Controlled Chimera')], 2);

            // --- A Common Shield Generator: a field roll of 06 stops the hit and overloads ---
            const shielded = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: token('Shield Gunner'),
                target: token('Shielded Chimera'),
                weaponName: 'Autocannon',
                faces: [[12, 100]] as Array<[number, number]>,
            });
            const shieldCard = await cardWith(page, shielded.messageIds, 'roll-control__roll-damage');
            let before = await messageIds(page);
            // The hit's damage dice, then the field's protection roll.
            await page.evaluate(
                async (a) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: a.id, buttonSelector: '.roll-control__roll-damage', faces: a.faces, expectMessages: 1 }),
                { id: shieldCard, faces: [...AUTOCANNON_DAMAGE, [6, 100]] as Array<[number, number]> },
            );
            const overload = await awaitCard(page, before, 'data-vehicle-row="vehicle-force-field"');
            expect((await vehicleRows(page, overload.html))['vehicle-force-field']).toBe('Nullified');
            expect(overload.html, 'the field overloads on its Common chance').toContain('Overloaded (01–10, Common)');
            expect(await snapCard(page, 'vehicle-damage-shield-generator-overloads', overload.id)).not.toBeNull();
            await expectActionButtonsFit(page, overload.id, 'vehicle-damage-shield-overload-buttons-in-sidebar');

            // --- A Force weapon passes the Daemon Engine's field unrolled ---
            const forced = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: token('Psyker'),
                target: token('Daemon Chimera'),
                weaponName: 'Force Sword',
                faces: [[12, 100]] as Array<[number, number]>,
            });
            const forceCard = await cardWith(page, forced.messageIds, 'roll-control__roll-damage');
            before = await messageIds(page);
            await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__roll-damage', faces: [], expectMessages: 1 }),
                forceCard,
            );
            const bypass = await awaitCard(page, before, 'data-vehicle-row="vehicle-force-field"');
            expect((await vehicleRows(page, bypass.html))['vehicle-force-field']).toBe('Bypassed');
            expect(bypass.html).toContain('the Force quality');
            expect(await snapCard(page, 'vehicle-damage-daemon-engine-field-bypassed', bypass.id)).not.toBeNull();

            // --- Damage Control: Righteous Fury on a 10, re-rolled on the Hull chart ---
            const controlled = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: token('Control Gunner'),
                target: token('Controlled Chimera'),
                weaponName: 'Autocannon',
                faces: [[12, 100]] as Array<[number, number]>,
            });
            const controlCard = await cardWith(page, controlled.messageIds, 'roll-control__roll-damage');
            before = await messageIds(page);
            await page.evaluate(
                async (a) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: a.id, buttonSelector: '.roll-control__roll-damage', faces: a.faces, expectMessages: 1 }),
                {
                    id: controlCard,
                    faces: [
                        [10, 10],
                        [5, 10],
                        [5, 10],
                        [4, 5],
                    ] as Array<[number, number]>,
                },
            );
            const fury = await awaitCard(page, before, 'data-vehicle-row="vehicle-righteous-fury"');
            expect(fury.html, 'the Righteous Fury row offers the re-roll').toContain('roll-control__damage-control');
            expect(await snapCard(page, 'vehicle-damage-damage-control-offered', fury.id)).not.toBeNull();
            // The card runs past the window; capture the Righteous Fury row and its button on their own.
            const furyPopout = await popOutChatMessage(page, fury.id);
            expect(
                await snap(page, 'vehicle-damage-damage-control-button', { selector: `${furyPopout} [data-vehicle-row="vehicle-righteous-fury"]` }),
            ).not.toBeNull();
            const rerolled = await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({
                        messageId: id,
                        buttonSelector: '.roll-control__damage-control',
                        faces: [[1, 5]] as Array<[number, number]>,
                        expectMessages: 1,
                    }),
                fury.id,
            );
            const rerollCard = rerolled.at(0) ?? '';
            const rerollHtml = await cardHtml(page, rerollCard);
            const rerollRows = await vehicleRows(page, rerollHtml);
            expect(rerollRows['vehicle-damage-control']).toBe('Re-rolled');
            expect(rerollRows['vehicle-righteous-fury'], 'the second roll stands').toBe('1');
            expect(rerollHtml).toContain('data-vehicle-row-chart');
            expect(await snapCard(page, 'vehicle-damage-damage-control-rerolled', rerollCard)).not.toBeNull();
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
        }
    });
});
