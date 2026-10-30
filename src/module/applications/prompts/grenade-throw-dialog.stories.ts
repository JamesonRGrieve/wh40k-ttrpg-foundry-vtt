import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import chatTemplateSrc from '../../../../src/templates/chat/grenade-throw-chat.hbs?raw';
import templateSrc from '../../../../src/templates/prompt/grenade-throw-dialog.hbs?raw';
import { formatKey, localizeKey } from '../../../../stories/mocks/lang-localize';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { resolveThrow } from '../../rules/combat-actions.ts';
import type { GrenadeRiderData } from '../../rules/grenade-rider.ts';
import { riderFixture } from '../../testing/grenade-rider-fixture.ts';
import { buildGrenadeThrowContext, type GrenadeItemView, type GrenadeLabels } from './grenade-throw-view.ts';

/**
 * Grenade throw dialog and its chat card (#135). Each grenade's rider is its compendium
 * document's `system.rider`; the fixtures below carry the DH2 values the packs author
 * (Photon Flash, Smoke, Psychotroke and Tears of the Emperor), plus a Frag Grenade with no rider. Tears of the Emperor
 * deals damage, so it takes the weapon roll and the dialog does not list it (#622).
 */

const CHARACTERISTIC_NAMES: Record<string, string> = { agility: 'Agility', toughness: 'Toughness', willpower: 'Willpower' };
const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? localizeKey(key) : formatKey(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]))),
    characteristic: (key) => CHARACTERISTIC_NAMES[key] ?? key,
    lang: 'en',
};

const rider = riderFixture;

function grenade(id: string, name: string, special: string[], riderData: GrenadeRiderData | null, damage = ''): GrenadeItemView {
    return {
        id,
        name,
        system: {
            rider: riderData,
            effectiveSpecial: new Set(special),
            fullDamageFormula: damage,
            damageTypeAbbr: damage === '' ? '' : 'X',
            qualitiesArray: special.map((quality) => {
                const rated = /^(.+)-(\d+)$/.exec(quality);
                const base = rated?.[1] ?? quality;
                return { label: base.replace(/^\w/, (c) => c.toUpperCase()), level: rated?.[2] === undefined ? null : Number(rated[2]) };
            }),
        },
    };
}

const ITEMS: GrenadeItemView[] = [
    grenade('frag', 'Frag Grenade', ['blast-3'], null, '2d10'),
    grenade(
        'photon',
        'Photon Flash Grenade',
        ['blast-6'],
        rider({
            test: { characteristic: 'agility', modifier: 10 },
            condition: 'blinded',
            duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
            effect: 'Everyone in the flash tests Agility (+10); a failure leaves them blinded for a round per degree of failure.',
        }),
    ),
    grenade(
        'psychotroke',
        'Psychotroke Grenade',
        ['blast-3', 'hallucinogenic-4'],
        rider({
            test: { characteristic: 'toughness', modifier: -40 },
            duration: { kind: 'degreesOfFailure', base: 1, formula: '' },
            effectRollShift: { perDegree: 1, max: 10 },
            effect: 'Each target tests Toughness against the gas, with no help from respirators; a failure brings on a brief delusion rolled on the hallucinogen table.',
        }),
    ),
    grenade(
        'tears',
        'Tears of the Emperor',
        ['blast-2', 'sanctified'],
        rider({
            duration: { kind: 'encounter', base: 0, formula: '' },
            effect: 'A psyker hit rolls for Perils of the Warp. A Daemonic target hit becomes Warp Unstable for the encounter, or takes −20 on those tests if it already is.',
        }),
        '1d10',
    ),
    grenade(
        'smoke',
        'Smoke Grenade',
        ['smoke-4'],
        rider({
            area: { size: '4', measure: 'radius' },
            duration: { kind: 'roll', base: 0, formula: '1d10+10' },
            effect: 'Fills the area with smoke that blocks sight (less long in bad weather) but not thermal or other non-visual sensors.',
        }),
    ),
];

interface Args {
    selectedId: string;
}

/** Whether the grenade's Throw opens this dialog — the gate the dialog itself lists by (#622: a damaging rider grenade does not). */
function opensDialog(item: GrenadeItemView): boolean {
    return resolveThrow({ class: 'thrown', type: 'grenade', ...item.system, dealsDamage: item.system.fullDamageFormula !== '' }).path === 'grenade-dialog';
}

/** The grenades the dialog lists, as the dialog filters the thrower's items. */
const DIALOG_ITEMS = ITEMS.filter(opensDialog);

function renderDialog(selectedId: string): HTMLElement {
    return renderSheet(templateSrc, { ...buildGrenadeThrowContext(DIALOG_ITEMS, selectedId, LABELS), gameSystem: 'dh2' });
}

const meta = {
    title: 'Dialogs/GrenadeThrowDialog',
    render: (args) => renderDialog(args.selectedId),
    args: { selectedId: 'psychotroke' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/**
 * The picker lists the rider grenades that deal no damage — the Frag Grenade (no rider)
 * and Tears of the Emperor (a rider, but 1d10 X damage, #622) take the normal roll.
 */
export const Psychotroke: Story = {
    play: async ({ canvasElement }) => {
        const ids = Array.from(canvasElement.querySelectorAll('[data-grenade-id]')).map((el) => el.getAttribute('data-grenade-id'));
        await expect(ids).toEqual(['photon', 'psychotroke', 'smoke']);
        const view = within(canvasElement);
        await expect(view.getByText('+1 to the effect roll per degree of failure (max 10)')).toBeTruthy();
        await expect(view.getByText('1 round, plus 1 per degree of failure')).toBeTruthy();
        await expect(canvasElement.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('data-grenade-id')).toBe('psychotroke');
    },
};

export const PhotonFlash: Story = {
    args: { selectedId: 'photon' },
    play: async ({ canvasElement }) => {
        const detail = canvasElement.querySelector<HTMLElement>('[data-grenade-detail]');
        await expect(detail?.textContent).toContain('Agility +10');
        await expect(detail?.textContent).toContain('1 round per degree of failure');
        await expect(detail?.textContent).toContain('blinded');
        await expect(within(canvasElement).getByText('6 m radius')).toBeTruthy();
    },
};

/**
 * Tears of the Emperor deals 1d10 X, so its Throw takes the weapon roll and its rider
 * follows its damage on the damage card (#622): the dialog does not offer it, even when
 * it is the grenade thrown, and opens on the first grenade it does list.
 */
export const TearsOfTheEmperorTakesTheWeaponRoll: Story = {
    args: { selectedId: 'tears' },
    play: async ({ canvasElement }) => {
        const tears = ITEMS.find((item) => item.id === 'tears');
        await expect(tears !== undefined && opensDialog(tears)).toBe(false);
        await expect(canvasElement.querySelector('[data-grenade-id="tears"]')).toBeNull();
        await expect(canvasElement.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('data-grenade-id')).toBe('photon');
    },
};

export const Smoke: Story = {
    args: { selectedId: 'smoke' },
    play: async ({ canvasElement }) => {
        const detail = canvasElement.querySelector<HTMLElement>('[data-grenade-detail]');
        await expect(detail?.textContent).toContain('1d10+10 rounds');
        await expect(within(canvasElement).getAllByText('None').length).toBeGreaterThan(0);
    },
};

/** Picking a grenade dispatches the dialog's `selectGrenade` action with that grenade's id; Throw and Cancel are wired. */
export const PickerActions: Story = {
    args: { selectedId: 'photon' },
    play: async ({ canvasElement }) => {
        const clicks = captureActionClicks(canvasElement);
        const smoke = canvasElement.querySelector<HTMLElement>('[data-grenade-id="smoke"]');
        if (smoke === null) throw new Error('no Smoke Grenade row');
        await userEvent.click(smoke);
        await userEvent.click(within(canvasElement).getByRole('button', { name: /Throw/i }));
        await expect(clicks.map((click) => `${click.action}:${click.dataset['grenadeId'] ?? ''}`)).toEqual(['selectGrenade:smoke', 'throw:']);
        await expect(canvasElement.querySelector('[data-action="cancel"]')).toBeTruthy();
    },
};

/** An actor carrying no rider grenade sees the empty state and a disabled Throw. */
export const NoRiderGrenade: Story = {
    render: () =>
        renderSheet(templateSrc, {
            ...buildGrenadeThrowContext(
                ITEMS.filter((item) => item.id === 'frag'),
                'frag',
                LABELS,
            ),
            gameSystem: 'dh2',
        }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('No grenade with a rider is carried.');
        await expect(within(canvasElement).getByRole('button', { name: /Throw/i })).toBeDisabled();
    },
};

/**
 * Throwing a rider grenade from the sheet opens the dialog on it (#619): the gate is
 * `resolveThrow` reading the thrown weapon's class, type and rider.
 */
export const ThrownPhotonFlashOpensOnIt: Story = {
    render: () => {
        const photon = ITEMS.find((item) => item.id === 'photon');
        return renderDialog(photon !== undefined && opensDialog(photon) ? 'photon' : '');
    },
    play: async ({ canvasElement }) => {
        const checked = Array.from(canvasElement.querySelectorAll('[data-grenade-id][aria-checked="true"]')).map((el) => el.getAttribute('data-grenade-id'));
        await expect(checked).toEqual(['photon']);
        await expect(canvasElement.textContent).toContain('blinded');
    },
};

/** The chat card the Throw posts, built from the same choice the dialog shows. */
export const ThrownCard: Story = {
    render: () => {
        const { selectedGrenade } = buildGrenadeThrowContext(DIALOG_ITEMS, 'photon', LABELS);
        return renderSheet(chatTemplateSrc, { rider: selectedGrenade, canResolve: selectedGrenade?.resolvable === true, gameSystem: 'dh2' });
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grenade-card]')?.getAttribute('data-wh40k-system')).toBe('dh2');
        await expect(canvasElement.querySelector('[data-grenade-effect]')?.textContent).toContain('tests Agility (+10)');
        const view = within(canvasElement);
        await expect(view.getByText('Photon Flash Grenade')).toBeTruthy();
        await expect(view.getByText('Agility +10')).toBeTruthy();
        await expect(view.getByText('6 m radius')).toBeTruthy();
        // A rider with a test resolves from this card (#623): the button carries no roll id,
        // the card's flags carry the area it resolves against.
        const resolve = view.getByRole('button', { name: /Resolve Rider/i });
        await expect(resolve.classList.contains('roll-control__resolve-rider')).toBe(true);
        await expect(resolve.hasAttribute('data-roll-id')).toBe(false);
    },
};

/** A Smoke grenade's screen has no test and no condition: its card states it and offers nothing to resolve. */
export const SmokeCardHasNothingToResolve: Story = {
    render: () => {
        const { selectedGrenade } = buildGrenadeThrowContext(DIALOG_ITEMS, 'smoke', LABELS);
        return renderSheet(chatTemplateSrc, { rider: selectedGrenade, canResolve: selectedGrenade?.resolvable === true, gameSystem: 'dh2' });
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grenade-effect]')?.textContent).toContain('blocks sight');
        await expect(canvasElement.querySelector('.roll-control__resolve-rider')).toBeNull();
    },
};
