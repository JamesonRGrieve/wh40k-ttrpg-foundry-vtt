import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { listBeyondHomeworlds } from '../../../../src/module/rules/beyond-homeworlds';
import templateSrc from '../../../../src/templates/prompt/beyond-homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/**
 * Storybook stories for BeyondHomeworldInfoDialog (GitHub #140 / #338).
 *
 * Renders the three Beyond home-worlds (Daemon World, Penal Colony,
 * Quarantine World) as a grid of cards. The dialog joins the slimmed
 * registry (riders + prose) with compendium-sourced mechanical basics
 * at render time; stories don't run the compendium stack, so the basics
 * are declared inline here mirroring `readHomeworldMechanics` output.
 * The play function verifies all three cards render and that the
 * Quarantine subtlety-clamp rider + Daemon corruption rider surface on
 * their cards.
 */

interface Args {
    showAllRiders: boolean;
}

/** Projected compendium basics per compendium identifier (mirrors the reader). */
const BASICS: Record<string, { bonuses: string[]; penalties: string[]; fateBase: number; blessing: number; aptitude: string; woundsFlat: number }> = {
    'daemon-world': { bonuses: ['Willpower', 'Perception'], penalties: ['Fellowship'], fateBase: 3, blessing: 4, aptitude: 'Willpower', woundsFlat: 7 },
    'penal-colony': { bonuses: ['Toughness', 'Perception'], penalties: ['Influence'], fateBase: 3, blessing: 8, aptitude: 'Toughness', woundsFlat: 10 },
    'quarantine-world': {
        bonuses: ['Ballistic Skill', 'Intelligence'],
        penalties: ['Strength'],
        fateBase: 3,
        blessing: 9,
        aptitude: 'Fieldcraft',
        woundsFlat: 8,
    },
};

interface BeyondHomeworldCardCtx {
    id: string;
    label: string;
    accent: string;
    bonusesLabel: string;
    penaltiesLabel: string;
    fateLabel: string;
    woundsLabel: string;
    aptitude: string;
    keyTalents: readonly string[];
    recommendedBackgrounds: readonly string[];
    mechanicalHook: string;
    corruptionRiderLabel: string | null;
    subtletyClampLabel: string | null;
}

function buildContext(): { homeworlds: BeyondHomeworldCardCtx[] } {
    return {
        homeworlds: listBeyondHomeworlds().map((def) => {
            const basics = BASICS[def.compendiumId] ?? { bonuses: [], penalties: [], fateBase: 0, blessing: 0, aptitude: '', woundsFlat: 0 };
            return {
                id: def.id,
                label: def.label,
                accent: def.id === 'daemonWorld' ? 'crimson' : def.id === 'penalColony' ? 'grey' : 'green',
                bonusesLabel: basics.bonuses.map((b) => `+${b}`).join(', '),
                penaltiesLabel: basics.penalties.map((p) => `-${p}`).join(', '),
                fateLabel: `${basics.fateBase} (Emperor's Blessing ${basics.blessing}+)`,
                woundsLabel: `${basics.woundsFlat} + 1d5`,
                aptitude: basics.aptitude,
                keyTalents: def.keyTalents,
                recommendedBackgrounds: def.recommendedBackgrounds,
                mechanicalHook: def.mechanicalHook,
                corruptionRiderLabel: def.corruptionRider ? `1d${def.corruptionRider.dieFaces} + ${def.corruptionRider.base} Corruption Points` : null,
                subtletyClampLabel: def.subtletyClamp
                    ? `Subtlety decreases reduced by ${def.subtletyClamp.reducedBy} (min reduction ${def.subtletyClamp.minimumReduction})`
                    : null,
            };
        }),
    };
}

const meta = {
    title: 'Dialogs/BeyondHomeworldInfoDialog',
    render: () => renderSheet(templateSrc, buildContext()),
    args: { showAllRiders: true },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const AllCardsPresent: Story = {
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // All three cards render.
        const daemon = canvasElement.querySelector('[data-homeworld-id="daemonWorld"]');
        const penal = canvasElement.querySelector('[data-homeworld-id="penalColony"]');
        const quarantine = canvasElement.querySelector('[data-homeworld-id="quarantineWorld"]');
        await expect(daemon).not.toBeNull();
        await expect(penal).not.toBeNull();
        await expect(quarantine).not.toBeNull();

        // Riders surface only on the cards that declare them.
        await expect(daemon?.querySelector('[data-rider="corruption"]')).not.toBeNull();
        await expect(quarantine?.querySelector('[data-rider="subtlety-clamp"]')).not.toBeNull();
        await expect(penal?.querySelector('[data-rider="corruption"]')).toBeNull();
        await expect(penal?.querySelector('[data-rider="subtlety-clamp"]')).toBeNull();
        await expect(daemon?.querySelector('[data-rider="subtlety-clamp"]')).toBeNull();
        await expect(quarantine?.querySelector('[data-rider="corruption"]')).toBeNull();

        // Aptitudes appear on their respective cards.
        await expect(storyCanvas.getByText('Willpower')).toBeTruthy();
        await expect(storyCanvas.getByText('Toughness')).toBeTruthy();
        await expect(storyCanvas.getByText('Fieldcraft')).toBeTruthy();
    },
};
