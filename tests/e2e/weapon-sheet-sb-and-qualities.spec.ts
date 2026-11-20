import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the weapon sheet's Damage tile and quality editing.
 *
 * #744: the Damage tile rolled a melee weapon's damage without the wielder's
 * Strength Bonus though the tile read "+SB". Every line's rules add SB to melee and
 * thrown damage, except a grenade's. A DH2 character with Strength 40 rolls a knife,
 * a throwing knife and a frag grenade from their sheets.
 *
 * #745: a weapon's own qualities had no add or remove control. A world weapon is
 * edited: a rated quality is refused without a level and added with one, its own
 * quality is removed, a quality from craftsmanship has no remove control, and a
 * dropped quality is added.
 *
 * Each flow records under `weapon-sheet-edit.flow`. Keys MUST match
 * WEAPON_SHEET_EDIT_FLOWS in scripts/e2e-coverage.mjs.
 */

const WEAPON_SHEET_EDIT_FLOWS = [
    'melee-damage-adds-sb',
    'thrown-damage-adds-sb',
    'grenade-damage-no-sb',
    'sb-label-follows-rule',
    'rated-quality-needs-level',
    'quality-added-from-picker',
    'own-quality-removed',
    'derived-quality-not-removable',
    'dropped-quality-added',
] as const;
type FlowName = (typeof WEAPON_SHEET_EDIT_FLOWS)[number];

/** The DH2 Tearing quality (dh2 weapon-qualities `tearing`). */
const TEARING = compendiumUuid({ line: 'dh2', category: 'weapon-qualities' }, 'B7QzxkyAU1g2TD5O');

const damage = (type: string): object => ({ formula: '1d10', bonus: 2, type, penetration: 0 });
const WEAPONS = [
    { name: 'Probe Knife', flow: 'melee-damage-adds-sb', addsSb: true, system: { class: 'melee', type: 'primitive', damage: damage('rending') } },
    { name: 'Probe Throwing Knife', flow: 'thrown-damage-adds-sb', addsSb: true, system: { class: 'thrown', type: 'primitive', damage: damage('rending') } },
    { name: 'Probe Frag Grenade', flow: 'grenade-damage-no-sb', addsSb: false, system: { class: 'thrown', type: 'grenade', damage: damage('explosive') } },
] as const;

interface DamageRead {
    label: string;
    rollTotal: number | null;
    cardTotal: number | null;
    sbRow: boolean;
    error: string | null;
}

/** Click a weapon sheet's Damage tile and read the chat card it posts. */
async function rollDamageTile(page: Page, actorId: string, itemName: string): Promise<DamageRead> {
    return page.evaluate(
        async (args: { actorId: string; itemName: string }): Promise<DamageRead> => {
            interface Msg {
                content: string;
                rolls: Array<{ total: number }>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    actors: { get: (id: string) => { items: { contents: Array<{ name: string; sheet: { element: HTMLElement } }> } } | undefined };
                    messages: { contents: Msg[] };
                };
            };
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const sheet = g.game.actors.get(args.actorId)?.items.contents.find((i) => i.name === args.itemName)?.sheet;
            if (sheet === undefined) return { label: '', rollTotal: null, cardTotal: null, sbRow: false, error: 'no sheet' };
            const label = sheet.element.querySelector('[data-weapon-damage]')?.textContent.trim() ?? '';
            const before = g.game.messages.contents.length;
            sheet.element.querySelector<HTMLElement>('[data-action="rollDamage"]')?.click();
            try {
                await waitFor(() => g.game.messages.contents.length > before, 'damage card', scale(10_000));
            } catch {
                return { label, rollTotal: null, cardTotal: null, sbRow: false, error: 'no damage card was posted' };
            }
            const msg = g.game.messages.contents.at(-1);
            // The card has no target, so its total is the damage callout's large value.
            const doc = new DOMParser().parseFromString(msg?.content ?? '', 'text/html');
            const total = doc.querySelector('[class*="tw-text-[2rem]"]')?.textContent.trim();
            return {
                label,
                rollTotal: msg?.rolls[0]?.total ?? null,
                cardTotal: total === undefined || total === '' ? null : Number(total),
                sbRow: msg?.content.toLowerCase().includes('strength bonus') === true,
                error: null,
            };
        },
        { actorId, itemName },
    );
}

interface QualityProbe {
    itemId: string | null;
    sheetId: string | null;
    refusedWithoutLevel: boolean;
    initial: string[];
    tiles: string[];
    afterAdd: string[];
    afterRemove: string[];
    afterDrop: string[];
    ownRemovable: boolean;
    derivedRemovable: boolean | null;
    pickerHasToxic: boolean;
    error: string | null;
}

/** Edit a world weapon's qualities through its sheet (#745). */
async function editQualities(page: Page, tearingUuid: string): Promise<QualityProbe> {
    return page.evaluate(async (tearing: string): Promise<QualityProbe> => {
        interface WeaponDoc {
            id: string;
            system: { special: Set<string> };
            sheet: {
                id: string;
                rendered: boolean;
                element: HTMLElement;
                render: (o: { force: boolean }) => Promise<object>;
                _onDrop: (e: DragEvent) => Promise<boolean>;
            };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { Item: { create: (d: object) => Promise<WeaponDoc | null> } };
        const { waitFor, settle, scaledMs: scale } = globalThis.wh40kE2E;
        const out: QualityProbe = {
            itemId: null,
            sheetId: null,
            refusedWithoutLevel: false,
            initial: [],
            tiles: [],
            afterAdd: [],
            afterRemove: [],
            afterDrop: [],
            ownRemovable: false,
            derivedRemovable: null,
            pickerHasToxic: false,
            error: null,
        };
        try {
            // A Poor pistol: craftsmanship gives it Unreliable, which is not its own quality.
            const weapon = await g.Item.create({
                name: 'Probe Quality Pistol',
                type: 'weapon',
                system: {
                    class: 'pistol',
                    type: 'solid-projectile',
                    craftsmanship: 'poor',
                    special: ['balanced'],
                    damage: { formula: '1d10', bonus: 2, type: 'impact' },
                },
            });
            if (weapon === null) throw new Error('the probe weapon was not created');
            out.itemId = weapon.id;
            out.initial = Array.from(weapon.system.special).sort();
            const sheet = weapon.sheet;
            await sheet.render({ force: true });
            await waitFor(() => sheet.rendered, 'weapon sheet render', scale(10_000));
            out.sheetId = sheet.id;
            const q = <T extends Element>(sel: string): T | null => sheet.element.querySelector<T>(sel);
            q<HTMLElement>('[data-action="toggleEditMode"]')?.click();
            await waitFor(() => q('[data-weapon-quality-picker]') !== null, 'quality picker', scale(10_000));
            await settle(300);

            out.tiles = Array.from(sheet.element.querySelectorAll<HTMLElement>('[data-action="openQuality"]'), (el) => el.dataset['identifier'] ?? '');
            out.ownRemovable = q('[data-action="removeQuality"][data-identifier="balanced"]') !== null;
            const unreliableTile = q('[data-action="openQuality"][data-identifier="unreliable"]');
            out.derivedRemovable = unreliableTile === null ? null : unreliableTile.querySelector('[data-action="removeQuality"]') !== null;

            const picker = q<HTMLSelectElement>('[data-sheet-local="new-quality"]');
            out.pickerHasToxic = picker?.querySelector('option[value="toxic-x"]') != null;
            const pick = (value: string, level: string): void => {
                const select = q<HTMLSelectElement>('[data-sheet-local="new-quality"]');
                const levelBox = q<HTMLInputElement>('[data-sheet-local="new-quality-level"]');
                if (select !== null) select.value = value;
                if (levelBox !== null) levelBox.value = level;
            };

            // A rated quality without a level is refused.
            pick('toxic-x', '');
            q<HTMLElement>('[data-action="addQuality"]')?.click();
            await settle(600);
            out.refusedWithoutLevel = !Array.from(weapon.system.special).some((id) => id.startsWith('toxic'));

            // With a level it is stored as toxic-4.
            pick('toxic-x', '4');
            q<HTMLElement>('[data-action="addQuality"]')?.click();
            await waitFor(() => weapon.system.special.has('toxic-4'), 'toxic-4 added', scale(5000)).catch(() => undefined);
            out.afterAdd = Array.from(weapon.system.special).sort();
            await waitFor(() => q('[data-action="removeQuality"][data-identifier="balanced"]') !== null, 'sheet redraw', scale(5000)).catch(() => undefined);

            // The weapon's own Balanced is removed.
            q<HTMLElement>('[data-action="removeQuality"][data-identifier="balanced"]')?.click();
            await waitFor(() => !weapon.system.special.has('balanced'), 'balanced removed', scale(5000)).catch(() => undefined);
            out.afterRemove = Array.from(weapon.system.special).sort();

            // A dropped Tearing is added.
            const transfer = new DataTransfer();
            transfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid: tearing }));
            await sheet._onDrop(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
            await waitFor(() => weapon.system.special.has('tearing'), 'tearing dropped', scale(5000)).catch(() => undefined);
            out.afterDrop = Array.from(weapon.system.special).sort();
            await settle(600);
        } catch (err) {
            out.error = err instanceof Error ? `${err.message} @ ${(err.stack ?? '').split('\n').slice(1, 6).join(' | ')}` : String(err);
        }
        return out;
    }, tearingUuid);
}

test.describe.serial('weapon sheet Damage tile SB and quality editing (Tier B, #744, #745)', () => {
    test.setTimeout(scaledMs(240_000));
    test('the Damage tile adds SB by the rules, and a weapon’s own qualities can be added and removed', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        let itemId: string | null = null;
        try {
            const owner = await createProbeActor(page, {
                name: 'SB probe',
                type: 'dh2-character',
                system: { characteristics: { strength: { base: 40 } } },
                items: WEAPONS.map((w) => ({ name: w.name, type: 'weapon', system: w.system })),
            });
            if (owner === null) throw new Error('the SB probe actor was not created');
            actors.push(owner);
            const sb = await page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: {
                        actors: { get: (i: string) => { system: { characteristics: { strength: { bonus: number; effectiveBonus?: number } } } } | undefined };
                    };
                };
                const strength = g.game.actors.get(id)?.system.characteristics.strength;
                return strength === undefined ? null : strength.effectiveBonus ?? strength.bonus;
            }, owner);

            const labels: string[] = [];
            for (const weapon of WEAPONS) {
                // eslint-disable-next-line no-await-in-loop -- one sheet open at a time, captured in turn
                const sheet = await openProbeSheet(page, owner, { itemName: weapon.name });
                if (sheet === null) {
                    record(weapon.flow, false, `${weapon.name}: sheet did not open`);
                    continue;
                }
                // eslint-disable-next-line no-await-in-loop -- rolls from the sheet just opened
                const read = await rollDamageTile(page, owner, weapon.name);
                const expected = read.rollTotal === null || sb === null ? null : read.rollTotal + (weapon.addsSb ? sb : 0);
                record(
                    weapon.flow,
                    read.error === null && expected !== null && read.cardTotal === expected && read.sbRow === weapon.addsSb,
                    `${weapon.name}: SB ${String(sb)}, roll ${String(read.rollTotal)}, card ${String(read.cardTotal)}, SB row ${String(read.sbRow)}; ${
                        read.error ?? ''
                    }`,
                );
                if (read.label.endsWith('+SB') !== weapon.addsSb) labels.push(`${weapon.name} shows "${read.label}"`);
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await snap(page, `weapon-sheet-sb-${weapon.name.toLowerCase().replace(/\s+/g, '-')}`, {
                    selector: `#${sheet.appId}`,
                    closeWindows: true,
                    keepWindow: sheet.appId,
                });
            }
            record('sb-label-follows-rule', labels.length === 0, labels.join('; '));

            const probe = await editQualities(page, TEARING);
            itemId = probe.itemId;
            const err = probe.error === null ? '' : `; error ${probe.error}`;
            record(
                'rated-quality-needs-level',
                probe.pickerHasToxic && probe.refusedWithoutLevel,
                `picker has Toxic (X): ${String(probe.pickerHasToxic)}${err}`,
            );
            record('quality-added-from-picker', probe.afterAdd.includes('toxic-4'), `after add: ${probe.afterAdd.join(', ')}${err}`);
            record(
                'own-quality-removed',
                probe.ownRemovable && !probe.afterRemove.includes('balanced'),
                `created with ${probe.initial.join(', ')}, tiles ${probe.tiles.join(', ')}, removable ${String(
                    probe.ownRemovable,
                )}, after remove: ${probe.afterRemove.join(', ')}${err}`,
            );
            record('derived-quality-not-removable', probe.derivedRemovable === false, `Unreliable tile removable: ${String(probe.derivedRemovable)}${err}`);
            record('dropped-quality-added', probe.afterDrop.includes('tearing'), `after drop: ${probe.afterDrop.join(', ')}${err}`);
            if (probe.sheetId !== null) {
                await snap(page, 'weapon-sheet-quality-editing', { selector: `#${probe.sheetId}`, closeWindows: true, keepWindow: probe.sheetId });
            }
        } finally {
            await deleteProbeActors(page, actors);
            if (itemId !== null) {
                await page.evaluate(async (id) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as { game: { items: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                    await g.game.items.get(id)?.delete();
                }, itemId);
            }
        }
        assertFlowResults({ results }, WEAPON_SHEET_EDIT_FLOWS, { dimension: 'weapon-sheet-edit.flow', label: 'weapon sheet edit' });
    });
});
