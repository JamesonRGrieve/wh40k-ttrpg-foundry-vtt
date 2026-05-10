import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import headerSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import headerRtSrc from '../src/templates/actor/player/header-rt.hbs?raw';
import npcTabSrc from '../src/templates/actor/npc/tab-npc.hbs?raw';
import biographyTabSrc from '../src/templates/actor/player/tab-biography.hbs?raw';
import skillsTabSrc from '../src/templates/actor/player/tab-skills.hbs?raw';
import tabsSrc from '../src/templates/actor/player/tabs.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { mockNpcSheetContext, mockPlayerSheetContext } from '../stories/mocks/sheet-contexts';
import type { SidebarHeaderField } from '../src/module/config/game-systems/types';

initializeStoryHandlebars();

const headerTemplate = Handlebars.compile(headerSrc);
const headerRtTemplate = Handlebars.compile(headerRtSrc);
const tabsTemplate = Handlebars.compile(tabsSrc);
const biographyTemplate = Handlebars.compile(biographyTabSrc);
const skillsTemplate = Handlebars.compile(skillsTabSrc);
const npcTemplate = Handlebars.compile(npcTabSrc);

function wrap(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

/**
 * Legacy DH2 header shape kept here so the input[name="system.rank"] assertion
 * below still has something to find — the current `DH2eSystemConfig.getHeaderFields`
 * returns Divination instead of Rank, so this test injects the prior shape via
 * `contextOverrides`.
 */
const LEGACY_DH2_HEADER_FIELDS: SidebarHeaderField[] = [
    { label: 'Player', name: 'system.bio.playerName', type: 'text', value: 'Player One', placeholder: 'Player Name' },
    { label: 'Home World', name: 'system.originPath.homeWorld', type: 'text', value: 'Hive World', placeholder: 'Home World' },
    { label: 'Career', name: 'system.originPath.career', type: 'text', value: 'Adept', placeholder: 'Career' },
    { label: 'Rank', name: 'system.rank', type: 'number', value: 3, placeholder: 'Rank', inputClass: 'wh40k-rank-input' },
];

function playerContext(systemId: 'dh2e' | 'im' | 'rt') {
    return mockPlayerSheetContext({
        systemId,
        actorOverrides: {
            system: {
                bio: {
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
            },
            items: [],
        },
        contextOverrides: systemId === 'dh2e' ? { headerFields: LEGACY_DH2_HEADER_FIELDS } : {},
    });
}

function npcContext() {
    return mockNpcSheetContext({ systemId: 'im' });
}

describe('character sheet template composition', () => {
    it('renders the DH2 sidebar header and biography tab together', () => {
        const context = playerContext('dh2e');
        const element = wrap(`
            <aside>${headerTemplate(context)}${tabsTemplate(context)}</aside>
            <main>${biographyTemplate(context)}</main>
        `);

        expect(element.querySelector('input[name="system.rank"]')).not.toBeNull();
        expect(element.querySelector('[data-item-id^="origin"]')).toBeNull();
        expect(element.textContent).toContain('Character Journal');
        expect(element.textContent).toContain('Interrogation Log');
    });

    it('renders Rogue Trader origin-path stages only in the RT header variant', () => {
        const context = playerContext('rt');
        const element = wrap(headerRtTemplate(context));

        expect(element.querySelector('[data-item-id^="origin"]')).not.toBeNull();
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
