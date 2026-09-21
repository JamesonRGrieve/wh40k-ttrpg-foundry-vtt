/**
 * Render tests for the portrait-pool control (#567) on the shared actor identity
 * partial (`src/templates/actor/partial/actor-identity.hbs`).
 *
 * The GM re-roll / pin icons are overlaid on the portrait ONLY when the actor
 * carries a pool of two or more portraits AND the viewer is a GM. These pin down
 * the visibility gate and the action wiring (`data-action`), which drive the
 * base-actor-sheet handlers that call `actor.rerollPortrait()` /
 * `actor.togglePortraitPin()`.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import actorIdentitySrc from '../src/templates/actor/partial/actor-identity.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
const template = HbsStory.compile(actorIdentitySrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

interface IdentityContext {
    actor: { name: string; img: string };
    // Opaque Foundry payload for the fixture — the control block reads no fields off it.
    system: object;
    isNPC: boolean;
    isGM?: boolean;
    hasPortraitPool?: boolean;
    portraitPinned?: boolean;
}

function baseContext(overrides: Partial<IdentityContext> = {}): IdentityContext {
    // isNPC:true skips the PC-only player-name block, keeping the fixture minimal.
    return { actor: { name: 'Hive Ganger', img: 'ganger.webp' }, system: {}, isNPC: true, ...overrides };
}

const reroll = (root: HTMLElement): Element | null => root.querySelector('[data-action="rerollPortrait"]');
const pin = (root: HTMLElement): Element | null => root.querySelector('[data-action="togglePortraitPin"]');

describe('actor-identity portrait-pool control (#567)', () => {
    it('renders re-roll + pin icons for a GM when the actor has a pool', () => {
        const root = dom(template(baseContext({ isGM: true, hasPortraitPool: true })));
        expect(reroll(root)).not.toBeNull();
        expect(pin(root)).not.toBeNull();
    });

    it('renders nothing new for a non-GM even with a pool', () => {
        const root = dom(template(baseContext({ isGM: false, hasPortraitPool: true })));
        expect(reroll(root)).toBeNull();
        expect(pin(root)).toBeNull();
    });

    it('renders nothing new for a GM when the actor has no pool', () => {
        const root = dom(template(baseContext({ isGM: true, hasPortraitPool: false })));
        expect(reroll(root)).toBeNull();
        expect(pin(root)).toBeNull();
    });

    it('the portrait <img> keeps its own editImage action, distinct from the pool icons', () => {
        const root = dom(template(baseContext({ isGM: true, hasPortraitPool: true })));
        const img = root.querySelector('img[data-action="editImage"]');
        expect(img).not.toBeNull();
        // The pool icons carry their OWN actions, so a click on them dispatches
        // re-roll / pin rather than the image editor.
        expect(reroll(root)?.getAttribute('data-action')).toBe('rerollPortrait');
        expect(pin(root)?.getAttribute('data-action')).toBe('togglePortraitPin');
    });

    it('the pin icon reflects the pinned state (a distinct tooltip when pinned)', () => {
        const unpinned = dom(template(baseContext({ isGM: true, hasPortraitPool: true, portraitPinned: false })));
        const pinned = dom(template(baseContext({ isGM: true, hasPortraitPool: true, portraitPinned: true })));
        const unpinnedTip = pin(unpinned)?.getAttribute('data-tooltip') ?? '';
        const pinnedTip = pin(pinned)?.getAttribute('data-tooltip') ?? '';
        // Different tooltips for the two states (Pin vs Unpin), whatever the langpack resolves them to.
        expect(unpinnedTip).not.toBe('');
        expect(pinnedTip).not.toBe('');
        expect(pinnedTip).not.toBe(unpinnedTip);
    });
});
