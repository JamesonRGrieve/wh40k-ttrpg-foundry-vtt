import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import headerSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import npcTabSrc from '../src/templates/actor/npc/tab-npc.hbs?raw';
import biographyTabSrc from '../src/templates/actor/player/tab-biography.hbs?raw';
import tabsSrc from '../src/templates/actor/player/tabs.hbs?raw';
import { mockActor, renderTemplate, type MockActor, type MockItem } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

type HeaderField = {
    label: string;
    name: string;
    type: 'text' | 'number' | 'select';
    value: string | number;
    placeholder?: string;
    options?: Record<string, string>;
    min?: number;
    max?: number;
    icon?: string;
    rowClass?: string;
    inputClass?: string;
    borderColor?: string;
    valueLabel?: string;
    valueClass?: string;
    valueColor?: string;
};

interface CharacterSheetArgs {
    actor: MockActor & Record<string, unknown>;
    system: MockActor['system'] & Record<string, unknown>;
    source: MockActor['system'] & Record<string, unknown>;
    editable: boolean;
    isNPC: boolean;
    isGM: boolean;
    biography: {
        source: { notes: string };
        enriched: { notes: string };
    };
    journalEntries: Array<Record<string, unknown>>;
    tabs: Array<Record<string, unknown>>;
    tab: Record<string, unknown>;
    headerFields: HeaderField[];
    originPathComplete: boolean;
    originPathSteps: Array<Record<string, unknown>>;
    horde?: Record<string, unknown>;
    transactionProfile?: Record<string, unknown>;
    tags?: string[];
}

const headerTemplate = Handlebars.compile(headerSrc);
const tabsTemplate = Handlebars.compile(tabsSrc);
const biographyTemplate = Handlebars.compile(biographyTabSrc);
const npcTemplate = Handlebars.compile(npcTabSrc);

function buildTabs(active: string) {
    return [
        { tab: 'skills', group: 'primary', label: 'Skills', cssClass: 'tab-skills', active: active === 'skills' },
        { tab: 'combat', group: 'primary', label: 'Combat', cssClass: 'tab-combat', active: active === 'combat' },
        { tab: 'equipment', group: 'primary', label: 'Equipment', cssClass: 'tab-equipment', active: active === 'equipment' },
        { tab: 'biography', group: 'primary', label: 'Biography', cssClass: 'tab-biography', active: active === 'biography' },
        { tab: 'npc', group: 'primary', label: 'NPC', cssClass: 'tab-npc', active: active === 'npc' },
    ];
}

function buildOriginSteps(): Array<Record<string, unknown>> {
    return [
        { label: 'Home World', icon: 'fa-globe', item: { _id: 'origin-1', img: 'icons/svg/book.svg', name: 'Hive World' } },
        { label: 'Background', icon: 'fa-scroll', item: { _id: 'origin-2', img: 'icons/svg/book.svg', name: 'Adeptus Administratum' } },
        { label: 'Role', icon: 'fa-user-shield', item: { _id: 'origin-3', img: 'icons/svg/book.svg', name: 'Seeker' } },
    ];
}

function buildPlayerHeaderFields(systemId: string): HeaderField[] {
    const defaults: Record<string, HeaderField[]> = {
        dh2e: [
            { label: 'Player', name: 'system.bio.playerName', type: 'text', value: 'Player One', placeholder: 'Player Name' },
            { label: 'Home World', name: 'system.originPath.homeWorld', type: 'text', value: 'Hive World', placeholder: 'Home World' },
            { label: 'Career', name: 'system.originPath.career', type: 'text', value: 'Adept', placeholder: 'Career' },
            { label: 'Rank', name: 'system.rank', type: 'number', value: 3, placeholder: 'Rank', inputClass: 'wh40k-rank-input' },
        ],
        im: [
            { label: 'Player', name: 'system.bio.playerName', type: 'text', value: 'Player One', placeholder: 'Player Name' },
            { label: 'Patron', name: 'system.originPath.homeWorld', type: 'text', value: 'House Varonius', placeholder: 'Patron' },
            { label: 'Faction', name: 'system.originPath.background', type: 'text', value: 'Administratum', placeholder: 'Faction' },
            { label: 'Role', name: 'system.originPath.role', type: 'text', value: 'Savant', placeholder: 'Role' },
            { label: 'Endeavour', name: 'system.originPath.motivation', type: 'text', value: 'Recover a lost ledger', placeholder: 'Endeavour' },
        ],
    };
    return defaults[systemId] ?? defaults.dh2e;
}

function buildPlayerArgs(systemId: string): CharacterSheetArgs {
    const actor = mockActor({
        _id: `actor-${systemId}`,
        name: systemId === 'im' ? 'Interrogator Hale' : 'Acolyte Vex',
        items: [
            {
                _id: 'peer-1',
                id: 'peer-1',
                name: 'Peer (Arbites)',
                img: 'icons/svg/book.svg',
                type: 'peer',
                isPeer: true,
                system: { modifier: 10 },
            } as MockItem,
            {
                _id: 'enemy-1',
                id: 'enemy-1',
                name: 'Enemy (Cultists)',
                img: 'icons/svg/book.svg',
                type: 'enemy',
                isEnemy: true,
                system: { modifier: -10 },
            } as MockItem,
        ],
        system: {
            bio: {
                playerName: 'Player One',
                age: '31',
                gender: 'Non-binary',
                build: 'Lean',
                complexion: 'Pale',
                hair: 'Black',
                eyes: 'Grey',
                quirks: 'Meticulous note-taker.',
                superstition: 'Recites the Litany of Accuracy before every shot.',
                mementos: 'Worn Inquisitorial seal.',
            },
            originPath: {
                homeWorld: systemId === 'im' ? 'House Varonius' : 'Hive World',
                background: systemId === 'im' ? 'Administratum' : 'Imperial Guard',
                role: systemId === 'im' ? 'Savant' : 'Warrior',
                motivation: systemId === 'im' ? 'Recover a lost ledger' : 'Duty',
                career: 'Adept',
                divination: 'Trust in your fellow man, and put your faith in the Emperor.',
            },
        },
    }) as CharacterSheetArgs['actor'];

    const system = actor.system as CharacterSheetArgs['system'];
    return {
        actor,
        system,
        source: system,
        editable: true,
        isNPC: false,
        isGM: true,
        biography: {
            source: { notes: '<p>Background notes.</p>' },
            enriched: { notes: '<p>Background notes.</p>' },
        },
        journalEntries: [
            {
                id: 'journal-1',
                name: 'Interrogation Log',
                system: { time: 'M41.998', place: 'Scintilla', description: 'Details from the latest investigation.' },
            },
        ],
        tabs: buildTabs('biography'),
        tab: { id: 'biography', group: 'primary', cssClass: 'tab-biography', active: true },
        headerFields: buildPlayerHeaderFields(systemId),
        originPathComplete: true,
        originPathSteps: buildOriginSteps(),
    };
}

function buildNpcArgs(): CharacterSheetArgs {
    const actor = {
        ...mockActor({
            _id: 'npc-im',
            name: 'Cult Demagogue',
            type: 'npc',
        }),
        inCombat: false,
    } as CharacterSheetArgs['actor'];
    const system = {
        ...actor.system,
        threatLevel: 7,
        threatTier: { label: 'Major Threat', color: '#f97316' },
        type: 'elite',
        role: 'commander',
        faction: 'Imperium Nihilus Separatists',
        subfaction: 'The Ragged Choir',
        allegiance: 'Chaos',
        source: 'IM Core p.214',
        quickNotes: '<p>Uses bodyguards aggressively.</p>',
        tactics: '<p>Opens with suppression and retreats to elevation.</p>',
    } as CharacterSheetArgs['system'];
    actor.system = system;

    return {
        actor,
        system,
        source: system,
        editable: true,
        isNPC: true,
        isGM: true,
        biography: {
            source: { notes: '' },
            enriched: { notes: '' },
        },
        journalEntries: [],
        tabs: buildTabs('npc'),
        tab: { id: 'npc', group: 'primary', cssClass: 'tab-npc', active: true },
        headerFields: [
            {
                label: 'Threat',
                name: 'system.threatLevel',
                type: 'number',
                value: 7,
                min: 1,
                max: 30,
                icon: 'fa-solid fa-skull',
                rowClass: 'wh40k-threat-row',
                inputClass: 'wh40k-threat-input',
                borderColor: '#f97316',
                valueLabel: 'Major Threat',
                valueClass: 'wh40k-threat-tier',
                valueColor: '#f97316',
            },
            { label: 'Type', name: 'system.type', type: 'select', value: 'elite', options: { elite: 'Elite', troop: 'Troop' } },
            { label: 'Role', name: 'system.role', type: 'select', value: 'commander', options: { commander: 'Commander', bruiser: 'Bruiser' } },
            { label: 'Faction', name: 'system.faction', type: 'text', value: 'Imperium Nihilus Separatists', placeholder: 'Faction' },
        ],
        originPathComplete: true,
        originPathSteps: buildOriginSteps(),
        horde: {
            enabled: true,
            magnitude: 18,
            magnitudeMax: 25,
            magnitudePercent: 72,
            damageMultiplier: 2,
            sizeModifier: 20,
            barClass: 'healthy',
            destroyed: false,
        },
        transactionProfile: { mode: 'barter' },
        tags: ['leader', 'chaos', 'ranged'],
    };
}

function renderCharacterSheet(args: CharacterSheetArgs, bodyTemplate: HandlebarsTemplateDelegate) {
    const template = Handlebars.compile(`
        <div class="tw-grid tw-grid-cols-[280px_minmax(0,1fr)]">
            <aside class="wh40k-sidebar tw-flex tw-min-h-full tw-flex-col tw-bg-[var(--color-bg-secondary,#252525)]">
                ${headerTemplate(args)}
                ${tabsTemplate(args)}
            </aside>
            <main class="wh40k-body tw-min-w-0 tw-p-2">
                ${bodyTemplate(args)}
            </main>
        </div>
    `);
    return renderTemplate(template, args);
}

const meta: Meta<CharacterSheetArgs> = {
    title: 'Actor/Character Sheets',
};

export default meta;
type Story = StoryObj<CharacterSheetArgs>;

export const DarkHeresy2Biography: Story = {
    name: 'Dark Heresy 2 Biography',
    args: buildPlayerArgs('dh2e'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Acolyte Vex')).toBeVisible();
        await expect(canvas.getByText('Biography')).toBeVisible();
        await expect(canvas.getByText('Character Journal')).toBeVisible();
    },
};

export const ImperiumMaledictumBiography: Story = {
    name: 'Imperium Maledictum Biography',
    args: buildPlayerArgs('im'),
    render: (args) => renderCharacterSheet(args, biographyTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('House Varonius')).toBeVisible();
        await expect(canvas.getByDisplayValue('Recover a lost ledger')).toBeVisible();
    },
};

export const ImperiumMaledictumNpc: Story = {
    name: 'Imperium Maledictum NPC',
    args: buildNpcArgs(),
    render: (args) => renderCharacterSheet(args, npcTemplate),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByDisplayValue('Cult Demagogue')).toBeVisible();
        await expect(canvas.getByText('GM Tools')).toBeVisible();
        await expect(canvas.getByText('Scale to Threat')).toBeVisible();
    },
};
