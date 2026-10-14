/**
 * Storybook stories for the Rogue Trader ship weapon card and its Fire dialog
 * (#184 — RT Core 1.4 errata, Chapter VIII).
 *
 * Each card story drives the real fire flow (with queued dice) against a
 * target ship and renders the card it produces, so the stories exercise the
 * same rules, view builders and template as play:
 *
 *   1. The book's macrobattery shot — 3 hits, the raider's 1 shield takes one,
 *      16 against Armour 15 is 1 point.
 *   2. The book's lance shot — shields down, Armour ignored, 9 damage, and the
 *      Crit Rating's Critical Hit.
 *   3. A critical stopped by the shields — 1 automatic point.
 *   4. A miss.
 *   5. The profile card (no shot), as `WH40KVoidcraft.fireWeapon` posts it, on
 *      another line to show the card has no RT-only assumption in its shell.
 *   6. A Crippled firing ship — Strength halved.
 *   7. A combined macrobattery salvo (p.221) — each battery's own test, the
 *      pooled hits with the shields' discard by battery, Armour once, and at
 *      most one Critical Hit.
 *
 * The dialog stories render `ship-assault-dialog.hbs` on the fire flow: the
 * gunnery inputs, the salvo inputs, and the resolved preview with the
 * target's before vitals.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import { readAssaultForm } from '../../src/module/applications/ship-assault/ship-assault-fields.ts';
import type { ShipAssaultSession } from '../../src/module/applications/ship-assault/ship-assault-flow.ts';
import { createShipWeaponFireFlow, type ShipWeaponFireInput } from '../../src/module/applications/ship-assault/ship-weapon-fire-flow.ts';
import shipWeaponChatSrc from '../../src/templates/chat/ship-weapon-chat.hbs?raw';
import dialogSrc from '../../src/templates/prompt/ship-assault-dialog.hbs?raw';
import { ATTACKER_SHIP, DEFENDER_SHIP, queueStoryRolls, storyLocalize, storyShipActor } from '../mocks/ship-assault';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

const MACROBATTERY: ShipWeaponFireInput['weapon'] = {
    name: 'Sunsear Laser Battery',
    img: 'icons/svg/target.svg',
    weaponClass: 'macrobattery',
    typeLabel: storyLocalize('WH40K.ShipWeapon.Type.Macrobattery'),
    locationLabel: storyLocalize('WH40K.ShipLocation.Prow'),
    strength: 3,
    damage: '1d10',
    crit: 4,
    range: 6,
};
const LANCE: ShipWeaponFireInput['weapon'] = {
    ...MACROBATTERY,
    name: 'Titanforge Lance',
    weaponClass: 'lance',
    typeLabel: storyLocalize('WH40K.ShipWeapon.Type.Lance'),
    locationLabel: storyLocalize('WH40K.ShipLocation.Dorsal'),
    strength: 1,
    damage: '1d10+4',
};

/** The book's raider: Armour 15. */
const RAIDER = { ...DEFENDER_SHIP, armour: 15 };

/** A second macrobattery the clicked one can combine with into a salvo (p.221). */
const BROADSIDE: ShipWeaponFireInput['weapon'] = {
    ...MACROBATTERY,
    name: 'Mars Broadside',
    locationLabel: storyLocalize('WH40K.ShipLocation.Starboard'),
    strength: 4,
    damage: '2d10',
};

/** How a story fires: the firing ship's Hull (0 fires it Crippled), and the macrobatteries it may combine. */
interface FireSetup {
    attackerHull?: number;
    /** The target's current Hull Integrity; 0 makes it a Crippled target (#187). */
    targetHull?: number;
    companions?: ShipWeaponFireInput['companions'];
}

/** Fire from the players' frigate. */
function startFire(weapon: ShipWeaponFireInput['weapon'], shields: number, setup: FireSetup = {}): ShipAssaultSession {
    const lock = { labelKey: 'WH40K.Voidcraft.ShipAction.Component.Effect', value: 10, data: { name: 'Lock on Target' } };
    const attackerHull = setup.attackerHull ?? ATTACKER_SHIP.hullIntegrity;
    return createShipWeaponFireFlow({
        weapon,
        ballisticSkill: 48,
        shipModifiers: weapon.weaponClass === 'macrobattery' ? [lock] : [],
        companions: setup.companions ?? [],
    }).start({
        attacker: { ...storyShipActor(ATTACKER_SHIP, 48), hullIntegrity: { value: attackerHull, max: ATTACKER_SHIP.hullIntegrity } },
        defender: { ...storyShipActor(RAIDER, 40, shields), hullIntegrity: { value: setup.targetHull ?? RAIDER.hullIntegrity, max: RAIDER.hullIntegrity } },
        localize: storyLocalize,
        degreesMethod: 'gen1',
    });
}

/** A form holding the gunnery inputs: close range, the gunner's BS, and the broadside ticked into a salvo when asked. */
function gunneryForm(gunnerSkill: number, withBroadside = false): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `<input name="gunnerSkill" value="${gunnerSkill}"><select name="rangeBand"><option value="close" selected>close</option></select>`;
    if (withBroadside) form.insertAdjacentHTML('beforeend', '<input type="checkbox" name="salvo-broadside" checked>');
    return form;
}

/** Fire, apply, and render the posted card. */
async function card(weapon: ShipWeaponFireInput['weapon'], shields: number, rolls: number[], gunnerSkill = 38, setup: FireSetup = {}): Promise<HTMLElement> {
    const session = startFire(weapon, shields, setup);
    queueStoryRolls(...rolls);
    await session.roll(readAssaultForm(gunneryForm(gunnerSkill, setup.companions !== undefined)));
    const applied = await session.apply(readAssaultForm(document.createElement('form')));
    return renderSheet(shipWeaponChatSrc, applied?.card.data ?? {});
}

const meta: Meta = {
    title: 'Chat/Ship Weapon Fire (#184)',
};
export default meta;

type Story = StoryObj;

/** Row text of every hoverable provenance row. */
function provenance(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-wh40k-tooltip="modifier"]')].map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
}

export const MacrobatteryBookExample: Story = {
    // BS 38 + Lock on Target 10 + close 10 = 58; roll 29 → 2 DoS, 3 hits; damage 9 + 7.
    loaders: [async () => ({ el: await card(MACROBATTERY, 1, [29, 9, 7]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(DEFENDER_SHIP.name, { selector: '[data-wh40k-hook="ship-weapon-target"]' })).toBeTruthy();
        // An undamaged target is not Crippled: damage past Armour causes no Critical Hit (#187).
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-crippled-critical"]')).toBeNull();
        await expect(provenance(canvasElement)).toEqual([
            'Lock on Target +10',
            'Within half range (6 VU weapon) +10',
            'Successful hit 1',
            '2 DoS: +1 hit each 2',
            `Void shields (${DEFENDER_SHIP.name}, 1 up) -1`,
            'Hit 1 (1d10) 9',
            'Hit 2 (1d10) 7',
            `Armour (${DEFENDER_SHIP.name}, 15) -15`,
        ]);
        const vitals = [...canvasElement.querySelectorAll('[data-wh40k-hook="ship-weapon-vitals"] tbody tr')].map((row) =>
            row.textContent.replace(/\s+/gu, ' ').trim(),
        );
        await expect(vitals[0]).toBe(
            `Hull Integrity ${DEFENDER_SHIP.hullIntegrity} / ${DEFENDER_SHIP.hullIntegrity} ${DEFENDER_SHIP.hullIntegrity} / ${DEFENDER_SHIP.hullIntegrity}`,
        );
        await expect(view.getByText('After')).toBeTruthy();
    },
};

export const CrippledFiringShip: Story = {
    name: 'Crippled firing ship — Strength halved, round up (#187)',
    // The book's macrobattery shot from a ship at 0 Hull Integrity: 3 hits, but a
    // Crippled Strength 3 battery lands only 2; the shield takes one; 9 vs Armour 15.
    loaders: [async () => ({ el: await card(MACROBATTERY, 1, [29, 9], 38, { attackerHull: 0 }) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const rows = provenance(canvasElement);
        await expect(rows).toContain('Crippled: Strength halved (3 → 2) -1');
        await expect(rows).toContain('Hit 1 (1d10) 9');
        await expect(rows.some((row) => row.startsWith('Hit 2'))).toBe(false);
        const hitsTotal = canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')?.textContent ?? '';
        await expect(hitsTotal.replace(/\s+/gu, ' ')).toMatch(/Total 1\b/u);
    },
};

export const CrippledTargetCritical: Story = {
    name: 'Crippled target — damage past Armour is a Critical Hit (#187)',
    // The book's macrobattery shot into a raider at 0 Hull: 16 against Armour 15 is 1 past it.
    loaders: [async () => ({ el: await card(MACROBATTERY, 1, [29, 9, 7], 38, { targetHull: 0 }) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const lines = [...canvasElement.querySelectorAll('[data-wh40k-hook="ship-weapon-crippled-critical"]')].map((el) => el.textContent.trim());
        await expect(lines).toEqual([`${DEFENDER_SHIP.name} is Crippled: 1 damage past its Armour is a Critical Hit on Table 8-12.`]);
    },
};

export const LanceCritical: Story = {
    // 58, roll 11 → 4 DoS: Strength caps the lance at 1 hit; Crit Rating 4 met.
    loaders: [async () => ({ el: await card(LANCE, 0, [11, 9, 5], 48) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(provenance(canvasElement)).toContain(`Lance ignores Armour (${DEFENDER_SHIP.name}, 15) 0`);
        await expect(provenance(canvasElement)).toContain('Capped at Strength 1 -1');
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-critical"]')?.textContent).toContain('Rolled 5 on 1d5');
    },
};

export const CriticalAllShielded: Story = {
    loaders: [async () => ({ el: await card(LANCE, 2, [11, 3], 48) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/void shields cancel every hit/)).toBeTruthy();
        await expect(provenance(canvasElement)).toContain('Critical Hit: 1 automatic point 1');
    },
};

export const Miss: Story = {
    loaders: [async () => ({ el: await card(MACROBATTERY, 1, [95]) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText(/The shot misses/)).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-damage"]')).toBeNull();
    },
};

export const ProfileOnly: Story = {
    render: () =>
        renderSheet(shipWeaponChatSrc, {
            weapon: MACROBATTERY,
            gameSystem: 'dh2',
            attackerName: ATTACKER_SHIP.name,
        }),
    play: async ({ canvasElement }) => {
        await expect(within(canvasElement).getByText('Sunsear Laser Battery')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-card"]')?.getAttribute('data-wh40k-system')).toBe('dh2');
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-assault-test"]')).toBeNull();
    },
};

const SALVO: FireSetup = { companions: [{ id: 'broadside', weapon: BROADSIDE, shipModifiers: [] }] };

export const SalvoCombined: Story = {
    name: 'Macrobattery salvo — each battery tests, hits pooled, Armour once (#184)',
    // Port battery: 38 + Lock on Target 10 + close 10 = 58, roll 29 → 3 hits. Broadside: 38 at standard
    // range, roll 20 → 2 hits. The shield takes one of the (cheaper) port hits; 9 + 7 + 12 + 10 = 38 − Armour 15 once = 23.
    loaders: [async () => ({ el: await card(MACROBATTERY, 1, [29, 20, 9, 7, 12, 10], 38, SALVO) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-salvo"]')?.textContent).toContain('2 macrobatteries');
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-test"]').length).toBe(2);
        await expect(view.getByText('Sunsear Laser Battery: Ballistic Skill Test')).toBeTruthy();
        await expect(view.getByText('Mars Broadside: Ballistic Skill Test')).toBeTruthy();
        const rows = provenance(canvasElement);
        await expect(rows).toContain(`Void shields (${DEFENDER_SHIP.name}) take Sunsear Laser Battery's hits -1`);
        await expect(rows).toContain('Hit 3: Mars Broadside (2d10) 12');
        await expect(rows.filter((row) => row.startsWith('Armour ('))).toEqual([`Armour (${DEFENDER_SHIP.name}, 15) -15`]);
        const totals = [...canvasElement.querySelectorAll('[data-wh40k-hook="ship-assault-damage"]')].map((el) => el.textContent.replace(/\s+/gu, ' '));
        await expect(totals.at(-1)).toMatch(/Total 23\b/u);
    },
};

export const SalvoOneCritical: Story = {
    name: 'Macrobattery salvo — at most one Critical Hit (#184)',
    // Both batteries roll 01 and meet Crit Rating 4; the salvo still rolls one 1d5.
    loaders: [async () => ({ el: await card(MACROBATTERY, 0, [1, 1, 1, 1, 1, 1, 1, 1, 1, 4], 38, SALVO) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="ship-weapon-critical"]').length).toBe(1);
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-critical"]')?.textContent).toContain(
            'A combined salvo inflicts at most one Critical Hit.',
        );
    },
};

/** The Fire dialog on the fire flow: inputs, or the resolved preview. */
async function dialog(resolve: boolean, setup: FireSetup = {}): Promise<HTMLElement> {
    const session = startFire(MACROBATTERY, 1, setup);
    if (resolve) {
        queueStoryRolls(29, 9, 7);
        await session.roll(readAssaultForm(gunneryForm(38)));
    }
    const preview = session.previewCard();
    return renderSheet(dialogSrc, {
        title: storyLocalize('WH40K.Voidcraft.Fire.Action'),
        hint: storyLocalize('WH40K.Voidcraft.Fire.ActionHint'),
        hasTargets: true,
        targets: [{ value: '0', label: DEFENDER_SHIP.name, selected: true }],
        resolved: session.resolved,
        groups: session.resolved ? session.choiceGroups() : session.inputGroups(),
        previewHtml: preview === null ? '' : renderSheet(shipWeaponChatSrc, preview.data).innerHTML,
    });
}

export const FireDialogInputs: Story = {
    loaders: [async () => ({ el: await dialog(false) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const gunner = canvasElement.querySelector<HTMLInputElement>('input[name="gunnerSkill"]');
        await expect(gunner?.value).toBe('48');
        const band = canvasElement.querySelector<HTMLSelectElement>('select[name="rangeBand"]');
        await expect([...(band?.options ?? [])].map((option) => option.textContent.trim())).toEqual([
            'Close: up to 3 VU (+10)',
            'Within range: up to 6 VU',
            'Long: up to 12 VU (−10)',
        ]);
        if (band !== null) await userEvent.selectOptions(band, 'long');
        await expect(band?.value).toBe('long');
        await expect(canvasElement.querySelector('[data-action="rollAssault"]')).toBeTruthy();
    },
};

export const FireDialogResolved: Story = {
    loaders: [async () => ({ el: await dialog(true) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-weapon-card"]')).toBeTruthy();
        // The preview shows the target's vitals before the shot, with no After column yet.
        await expect(within(canvasElement).queryByText('After')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="applyAssault"]')).toBeTruthy();
        await expect(canvasElement.querySelector('select[name="defender"]')).toBeNull();
    },
};

export const FireDialogSalvoInputs: Story = {
    name: 'Fire dialog — combine another macrobattery into a salvo (#184)',
    loaders: [async () => ({ el: await dialog(false, SALVO) })],
    render: (_args, { loaded }) => (loaded as { el: HTMLElement }).el,
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Combine macrobatteries into one salvo')).toBeTruthy();
        const include = canvasElement.querySelector<HTMLInputElement>('input[name="salvo-broadside"]');
        await expect(include?.checked).toBe(false);
        if (include !== null) await userEvent.click(include);
        await expect(include?.checked).toBe(true);
        const band = canvasElement.querySelector<HTMLSelectElement>('select[name="salvoRange-broadside"]');
        if (band !== null) await userEvent.selectOptions(band, 'close');
        await expect(band?.value).toBe('close');
        const shields = canvasElement.querySelector<HTMLSelectElement>('select[name="shieldsFirst"]');
        // The 1d10 battery's hits are worth less than the 2d10 broadside's, so the shields take them by default.
        await expect(shields?.value).toBe('primary');
        await expect([...(shields?.options ?? [])].map((option) => option.textContent.trim())).toEqual(['Sunsear Laser Battery', 'Mars Broadside']);
        // The form the dialog reads now names the broadside in the salvo.
        const form = readAssaultForm(canvasElement);
        await expect(form.checked('salvo-broadside')).toBe(true);
        await expect(form.text('salvoRange-broadside', 'standard')).toBe('close');
    },
};
