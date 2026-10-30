/**
 * The Aptitudes panel on the Skills tab, per line (#631).
 *
 * The panel lists the actor's granted aptitudes plus its line's universal ones
 * (`AptitudeBasedSystemConfig.universalAptitudes`), and the template drops the
 * whole panel when that list is empty. Black Crusade has no aptitudes (it
 * prices advances by Chaos alignment), so a BC NPC must show no
 * panel at all rather than a lone "General"; DH2 and Only War keep General.
 *
 * The pills are built from the real line config, the same source the sheet
 * reads, so a line that regains a universal aptitude shows up here.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { AptitudeBasedSystemConfig } from '../../src/module/config/game-systems/aptitude-based-system-config';
import { SystemConfigRegistry } from '../../src/module/config/game-systems/index';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import { asBaseActor } from '../../src/module/testing/actor-stub';
import tabSkillsSrc from '../../src/templates/actor/player/tab-skills.hbs?raw';
import { mockNpcSheetContext } from '../mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

const LINES: readonly GameSystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];

interface AptitudePill {
    aptitude: string;
    sources: string[];
}

/** An NPC's aptitude pills on `systemId`: it has no granted aptitudes, so only the line's universal ones. */
function npcAptitudePills(systemId: GameSystemId): AptitudePill[] {
    const config = SystemConfigRegistry.get(systemId);
    if (!(config instanceof AptitudeBasedSystemConfig)) return [];
    return config.getCharacterAptitudes(asBaseActor({ system: {} })).map((aptitude) => ({ aptitude, sources: ['Universal'] }));
}

interface AptitudesArgs {
    systemId: GameSystemId;
}

function renderSkillsTab(systemId: GameSystemId): HTMLElement {
    const context = mockNpcSheetContext({
        systemId,
        activeTab: 'skills',
        contextOverrides: { aptitudePills: npcAptitudePills(systemId), tab: { id: 'skills', group: 'primary', cssClass: 'tab-skills', active: true } },
    });
    const root = renderSheet(tabSkillsSrc, context);
    root.dataset['wh40kSystem'] = systemId;
    return root;
}

/** The rendered Aptitudes panel, found by its header title. */
function aptitudesPanel(root: HTMLElement): HTMLElement | null {
    const header = Array.from(root.querySelectorAll<HTMLElement>('.wh40k-panel-header')).find((el) => el.textContent.trim() === 'Aptitudes');
    return header?.closest<HTMLElement>('.wh40k-panel') ?? null;
}

const meta: Meta<AptitudesArgs> = {
    title: 'Actor/Panels/AptitudesPanel',
    args: { systemId: 'bc' },
    render: (args) => renderSkillsTab(args.systemId),
};
export default meta;
type Story = StoryObj<AptitudesArgs>;

export const BlackCrusadeNpc: Story = {
    name: 'Black Crusade NPC — no Aptitudes panel (#631)',
    play: async ({ canvasElement }) => {
        await expect(aptitudesPanel(canvasElement)).toBeNull();
        await expect(canvasElement.textContent).not.toContain('General');
        // Characteristics still render, now full width.
        await expect(canvasElement.textContent).toContain('Characteristics');
    },
};

export const DarkHeresy2Npc: Story = {
    name: 'Dark Heresy 2 NPC — General aptitude',
    args: { systemId: 'dh2' },
    play: async ({ canvasElement }) => {
        await expect(aptitudesPanel(canvasElement)).not.toBeNull();
        await expect(canvasElement.textContent).toContain('General');
    },
};

export const EveryLine: Story = {
    name: 'Aptitudes panel on every line',
    render: () => {
        const grid = document.createElement('div');
        grid.className = 'tw-grid tw-grid-cols-2 tw-gap-4';
        for (const systemId of LINES) grid.appendChild(renderSkillsTab(systemId));
        return grid;
    },
    play: async ({ canvasElement }) => {
        const sheets = Array.from(canvasElement.querySelectorAll<HTMLElement>(':scope > div > [data-wh40k-system]'));
        await expect(sheets).toHaveLength(LINES.length);
        const withPanel = sheets.filter((sheet) => aptitudesPanel(sheet) !== null).map((sheet) => sheet.dataset['wh40kSystem']);
        // Only the lines with a General aptitude (DH2, OW) show the panel.
        await expect(withPanel).toEqual(['dh2', 'ow']);
    },
};
