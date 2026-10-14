import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent, within } from 'storybook/test';
import chatTemplateSrc from '../../../../src/templates/chat/grenade-throw-chat.hbs?raw';
import templateSrc from '../../../../src/templates/prompt/grenade-throw-dialog.hbs?raw';
import { formatKey, localizeKey } from '../../../../stories/mocks/lang-localize';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { resolveThrow } from '../../rules/combat-actions.ts';
import type { GrenadeRiderData } from '../../rules/grenade-rider.ts';
import { buildGrenadeThrowContext, type GrenadeItemView, type GrenadeLabels } from './grenade-throw-view.ts';

/**
 * Grenade throw dialog and its chat card (#135). Each grenade's rider is its compendium
 * document's `system.rider`; the fixtures below carry the DH2 values the packs author
 * (Photon Flash and Smoke, Core p.158 / p.149; Psychotroke and Tears of the Emperor,
 * Enemies Within pp.44–45), plus a Frag Grenade with no rider.
 */

const CHARACTERISTIC_NAMES: Record<string, string> = { agility: 'Agility', toughness: 'Toughness', willpower: 'Willpower' };
const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? localizeKey(key) : formatKey(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]))),
    characteristic: (key) => CHARACTERISTIC_NAMES[key] ?? key,
};

function rider(overrides: Partial<GrenadeRiderData>): GrenadeRiderData {
    return {
        test: { characteristic: '', modifier: 0 },
        area: { size: '', measure: 'radius' },
        duration: { kind: '', base: 0, formula: '' },
        effectRollShift: { perDegree: 0, max: 0 },
        effect: '',
        ...overrides,
    };
}

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
            duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
            effect: 'Any character within the blast radius when it detonates must succeed on an Ordinary (+10) Agility test or be blinded for a number of rounds equal to his degrees of failure.',
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
            effect: 'Each creature struck tests Toughness against Hallucinogenic (4); respirators and sealed armour grant no bonus. On a failure it suffers a temporary delusion: roll 1d10 on Table 5–3: Hallucinogen Effects (Dark Heresy Core Rulebook, page 146).',
        }),
    ),
    grenade(
        'tears',
        'Tears of the Emperor',
        ['blast-2', 'sanctified'],
        rider({
            duration: { kind: 'encounter', base: 0, formula: '' },
            effect: 'A psyker struck must immediately roll on Table 6–3: Perils of the Warp (Dark Heresy Core Rulebook, page 197). A creature with the Daemonic trait struck gains the Warp Instability trait until the end of the encounter; if it already has the trait, it suffers a −20 penalty to the tests it makes for that trait until the end of the encounter.',
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
            effect: 'Creates a smokescreen of thick, black clouds at the point of impact that obscures vision, lasting less in adverse weather. It does not block detection systems that use heat or other spectral bands outside normal human eyesight.',
        }),
    ),
];

interface Args {
    selectedId: string;
}

function renderDialog(selectedId: string): HTMLElement {
    return renderSheet(templateSrc, { ...buildGrenadeThrowContext(ITEMS, selectedId, LABELS), gameSystem: 'dh2' });
}

const meta = {
    title: 'Dialogs/GrenadeThrowDialog',
    render: (args) => renderDialog(args.selectedId),
    args: { selectedId: 'psychotroke' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** The picker lists the rider grenades only — the Frag Grenade, which has none, takes the normal roll. */
export const Psychotroke: Story = {
    play: async ({ canvasElement }) => {
        const ids = Array.from(canvasElement.querySelectorAll('[data-grenade-id]')).map((el) => el.getAttribute('data-grenade-id'));
        await expect(ids).toEqual(['photon', 'psychotroke', 'tears', 'smoke']);
        const view = within(canvasElement);
        await expect(view.getByText('+1 to the effect roll per degree of failure (max 10)')).toBeTruthy();
        await expect(view.getByText('1 round(s), plus 1 per degree of failure')).toBeTruthy();
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

/** A grenade with no test shows its effect under "Effect", and its damage beside the area. */
export const TearsOfTheEmperor: Story = {
    args: { selectedId: 'tears' },
    play: async ({ canvasElement }) => {
        const detail = canvasElement.querySelector<HTMLElement>('[data-grenade-detail]');
        await expect(detail?.textContent).toContain('Effect');
        await expect(detail?.textContent).toContain('Until the end of the encounter');
        await expect(detail?.textContent).toContain('Perils of the Warp');
        await expect(within(canvasElement).getByText('1d10 X')).toBeTruthy();
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
        const opens = photon !== undefined && resolveThrow({ class: 'thrown', type: 'grenade', ...photon.system }).path === 'grenade-dialog';
        return renderDialog(opens ? 'photon' : '');
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
        const { selectedGrenade } = buildGrenadeThrowContext(ITEMS, 'photon', LABELS);
        return renderSheet(chatTemplateSrc, { ...selectedGrenade, gameSystem: 'dh2' });
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grenade-card]')?.getAttribute('data-wh40k-system')).toBe('dh2');
        await expect(canvasElement.querySelector('[data-grenade-effect]')?.textContent).toContain('Ordinary (+10) Agility test');
        const view = within(canvasElement);
        await expect(view.getByText('Photon Flash Grenade')).toBeTruthy();
        await expect(view.getByText('Agility +10')).toBeTruthy();
        await expect(view.getByText('6 m radius')).toBeTruthy();
    },
};
