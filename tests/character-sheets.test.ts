import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import headerSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import npcTabSrc from '../src/templates/actor/npc/tab-npc.hbs?raw';
import biographyTabSrc from '../src/templates/actor/player/tab-biography.hbs?raw';
import skillsTabSrc from '../src/templates/actor/player/tab-skills.hbs?raw';
import tabsSrc from '../src/templates/actor/player/tabs.hbs?raw';
import { mockActor } from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const headerTemplate = Handlebars.compile(headerSrc);
const tabsTemplate = Handlebars.compile(tabsSrc);
const biographyTemplate = Handlebars.compile(biographyTabSrc);
const skillsTemplate = Handlebars.compile(skillsTabSrc);
const npcTemplate = Handlebars.compile(npcTabSrc);

function wrap(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

function playerContext(systemId: 'dh2e' | 'im') {
    const actor = mockActor({
        name: systemId === 'im' ? 'Interrogator Hale' : 'Acolyte Vex',
        items: [],
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
                superstition: 'Whispers litanies before every firefight.',
                mementos: 'An old signet ring.',
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
    });

    return {
        actor,
        system: actor.system,
        source: actor.system,
        editable: true,
        isNPC: false,
        isGM: true,
        biography: {
            source: { notes: '<p>Background notes.</p>' },
            enriched: { notes: '<p>Background notes.</p>' },
        },
        inEditMode: false,
        journalEntries: [{ id: 'journal-1', name: 'Interrogation Log', system: { time: 'M41.998', place: 'Scintilla', description: 'Important lead.' } }],
        tabs: [
            { tab: 'skills', group: 'primary', label: 'Skills', cssClass: 'tab-skills', active: false },
            { tab: 'combat', group: 'primary', label: 'Combat', cssClass: 'tab-combat', active: false },
            { tab: 'equipment', group: 'primary', label: 'Equipment', cssClass: 'tab-equipment', active: false },
            { tab: 'biography', group: 'primary', label: 'Biography', cssClass: 'tab-biography', active: true },
        ],
        tab: { id: 'biography', group: 'primary', cssClass: 'tab-biography', active: true },
        headerFields:
            systemId === 'im'
                ? [
                      { label: 'Player', name: 'system.bio.playerName', type: 'text', value: 'Player One', placeholder: 'Player Name' },
                      { label: 'Patron', name: 'system.originPath.homeWorld', type: 'text', value: 'House Varonius', placeholder: 'Patron' },
                      { label: 'Faction', name: 'system.originPath.background', type: 'text', value: 'Administratum', placeholder: 'Faction' },
                      { label: 'Role', name: 'system.originPath.role', type: 'text', value: 'Savant', placeholder: 'Role' },
                      { label: 'Endeavour', name: 'system.originPath.motivation', type: 'text', value: 'Recover a lost ledger', placeholder: 'Endeavour' },
                  ]
                : [
                      { label: 'Player', name: 'system.bio.playerName', type: 'text', value: 'Player One', placeholder: 'Player Name' },
                      { label: 'Home World', name: 'system.originPath.homeWorld', type: 'text', value: 'Hive World', placeholder: 'Home World' },
                      { label: 'Career', name: 'system.originPath.career', type: 'text', value: 'Adept', placeholder: 'Career' },
                      { label: 'Rank', name: 'system.rank', type: 'number', value: 3, placeholder: 'Rank', inputClass: 'wh40k-rank-input' },
                  ],
        originPathComplete: true,
        originPathSteps: [{ label: 'Origin', icon: 'fa-globe', item: { _id: 'origin-1', img: 'icons/svg/book.svg', name: 'Hive World' } }],
    };
}

function npcContext() {
    const actor = {
        ...mockActor({
            name: 'Cult Demagogue',
            type: 'npc',
        }),
        inCombat: false,
    };
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
        tactics: '<p>Retreats to elevation when pressured.</p>',
    };
    actor.system = system;

    return {
        actor,
        system,
        source: system,
        editable: true,
        isNPC: true,
        isGM: true,
        tabs: [{ tab: 'npc', group: 'primary', label: 'NPC', cssClass: 'tab-npc', active: true }],
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
        originPathSteps: [{ label: 'Origin', icon: 'fa-globe', item: { _id: 'origin-1', img: 'icons/svg/book.svg', name: 'Hive World' } }],
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

describe('character sheet template composition', () => {
    it('renders the DH2 sidebar header and biography tab together', () => {
        const context = playerContext('dh2e');
        const element = wrap(`
            <aside>${headerTemplate(context)}${tabsTemplate(context)}</aside>
            <main>${biographyTemplate(context)}</main>
        `);

        expect(element.querySelector('input[name="system.rank"]')).not.toBeNull();
        expect(element.textContent).toContain('Character Journal');
        expect(element.textContent).toContain('Interrogation Log');
    });

    it('renders the IM sidebar header fields in the shared layout', () => {
        const context = playerContext('im');
        const element = wrap(headerTemplate(context));

        expect(element.querySelector('input[name="system.originPath.homeWorld"]')?.getAttribute('value')).toBe('House Varonius');
        expect(element.querySelector('input[name="system.originPath.motivation"]')?.getAttribute('value')).toBe('Recover a lost ledger');
        expect(element.textContent).toContain('Patron');
        expect(element.textContent).toContain('Endeavour');
    });

    it('renders the NPC tab with IM-compatible sheet chrome and controls', () => {
        const context = npcContext();
        const element = wrap(`
            <aside>${headerTemplate(context)}${tabsTemplate(context)}</aside>
            <main>${npcTemplate(context)}</main>
        `);

        expect(element.textContent).toContain('GM Tools');
        expect(element.textContent).toContain('Scale to Threat');
        expect(element.querySelector('[data-action="toggleHordeMode"]')).not.toBeNull();
        expect(element.querySelector('input[name="system.threatLevel"]')).not.toBeNull();
    });

    it('renders a direct characteristic roll overlay on the statistics page', () => {
        const context = {
            ...playerContext('dh2e'),
            tab: { id: 'skills', group: 'primary', cssClass: 'tab-skills', active: true },
        };
        const element = wrap(skillsTemplate(context));

        const overlay = element.querySelector<HTMLElement>('.wh40k-char-hud-circle [data-roll-type="characteristic"]');
        expect(overlay).not.toBeNull();
        expect(overlay?.querySelector('.fa-dice-d20')).not.toBeNull();
        expect(overlay?.dataset.rollTarget).toBeTruthy();
    });
});
