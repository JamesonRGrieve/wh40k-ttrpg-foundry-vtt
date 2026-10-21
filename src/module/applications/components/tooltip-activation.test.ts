import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
import { type ActivatableTooltipManager, activateRichTooltips, makeRichTooltipsFocusable } from './tooltip-activation.ts';

/**
 * Rich tooltips open on hover and keyboard focus (#692). Foundry's TooltipManager
 * opens on hover only for `data-tooltip` elements and never on focus, so an
 * element marked only `data-wh40k-tooltip` (every roll card's provenance row)
 * opened nothing.
 */

const HOVER_DELAY_MS = 500;
const PAYLOAD = '{"title":"Aim","sources":[{"name":"Aim","value":10}]}';

/** A manager that records what it was asked to open. */
function recordingManager(): ActivatableTooltipManager & { opened: HTMLElement[]; closed: number } {
    const manager = {
        element: null as HTMLElement | null,
        opened: [] as HTMLElement[],
        closed: 0,
        activate(element: HTMLElement): void {
            manager.element = element;
            manager.opened.push(element);
        },
        deactivate(): void {
            manager.element = null;
            manager.closed += 1;
        },
    };
    return manager;
}

function richRow(extra = ''): HTMLElement {
    document.body.insertAdjacentHTML('beforeend', `<div class="row" data-wh40k-tooltip="modifier" data-wh40k-tooltip-data='${PAYLOAD}' ${extra}>Aim +10</div>`);
    const row = document.body.lastElementChild;
    if (!(row instanceof HTMLElement)) throw new Error('row not rendered');
    return row;
}

describe('activateRichTooltips', () => {
    let manager: ReturnType<typeof recordingManager>;
    let stop: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.replaceChildren();
        manager = recordingManager();
        stop = activateRichTooltips(document, () => manager, HOVER_DELAY_MS);
    });

    afterEach(() => {
        stop();
        vi.useRealTimers();
    });

    it('opens a rich tooltip after the hover delay', () => {
        const row = richRow();
        row.dispatchEvent(new PointerEvent('pointerenter'));
        expect(manager.opened).toEqual([]);
        vi.advanceTimersByTime(HOVER_DELAY_MS);
        expect(manager.opened).toEqual([row]);
    });

    it('does not open when the pointer leaves before the delay', () => {
        const row = richRow();
        row.dispatchEvent(new PointerEvent('pointerenter'));
        row.dispatchEvent(new PointerEvent('pointerleave'));
        vi.advanceTimersByTime(HOVER_DELAY_MS);
        expect(manager.opened).toEqual([]);
    });

    it('leaves hover to Foundry when the element carries data-tooltip', () => {
        const row = richRow('data-tooltip="Aim"');
        row.dispatchEvent(new PointerEvent('pointerenter'));
        vi.advanceTimersByTime(HOVER_DELAY_MS);
        expect(manager.opened).toEqual([]);
    });

    it('opens on keyboard focus and closes on blur', () => {
        const row = richRow('tabindex="0"');
        row.focus();
        expect(manager.opened).toEqual([row]);
        row.blur();
        expect(manager.closed).toBe(1);
    });

    it('ignores an element without a payload', () => {
        document.body.insertAdjacentHTML('beforeend', '<div data-wh40k-tooltip="modifier">Aim</div>');
        document.body.lastElementChild?.dispatchEvent(new PointerEvent('pointerenter'));
        vi.advanceTimersByTime(HOVER_DELAY_MS);
        expect(manager.opened).toEqual([]);
    });
});

describe('makeRichTooltipsFocusable', () => {
    it('puts rich-tooltip elements in the Tab order and leaves focusable or opted-out ones alone', () => {
        document.body.replaceChildren();
        const row = richRow();
        const button = document.createElement('button');
        button.dataset['wh40kTooltip'] = 'modifier';
        button.dataset['wh40kTooltipData'] = PAYLOAD;
        document.body.appendChild(button);
        const optedOut = richRow('tabindex="-1"');
        makeRichTooltipsFocusable(document.body);
        expect(row.getAttribute('tabindex')).toBe('0');
        expect(button.hasAttribute('tabindex')).toBe(false);
        expect(optedOut.getAttribute('tabindex')).toBe('-1');
    });
});

/* -------------------------------------------- */
/*  Source guard: every emitter can activate    */
/* -------------------------------------------- */

/** The tooltip types `TooltipsWH40K._buildTooltipContent` builds. */
const TOOLTIP_TYPES = new Set(['characteristic', 'skill', 'armor', 'armour', 'weapon', 'modifier', 'quality', 'generic']);

const REPO = join(__dirname, '..', '..', '..', '..');

/** Templates and production TypeScript: everything that can write the attribute into the page. */
function emitterFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return emitterFiles(path);
        if (name.endsWith('.hbs')) return [path];
        return name.endsWith('.ts') && !/\.(test|stories)\.ts$/u.test(name) && !name.endsWith('.d.ts') ? [path] : [];
    });
}

/** Blank out comments (TS block and line, Handlebars `{{!-- --}}` / `{{! }}`), keeping line numbers. */
function withoutComments(source: string): string {
    const blank = (text: string): string => text.replace(/[^\n]/gu, ' ');
    return source.replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}|\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, blank);
}

/** The opening tag around `index`, from its `<` to the `>` that closes it (a Handlebars `{{>` is not a close). */
function tagAround(source: string, index: number): string {
    const start = source.lastIndexOf('<', index);
    let end = index;
    while (end < source.length && !(source[end] === '>' && source.slice(end - 2, end) !== '{{')) end += 1;
    return source.slice(start, end + 1);
}

describe('every rich-tooltip emitter can activate (#692)', () => {
    const emitters = emitterFiles(join(REPO, 'src')).flatMap((file) => {
        const source = withoutComments(readFileSync(file, 'utf8'));
        return [...source.matchAll(/data-wh40k-tooltip="([^"]*)"/gu)].map((match) => {
            const [, type = ''] = match;
            return {
                at: `${relative(REPO, file)}:${source.slice(0, match.index).split('\n').length}`,
                type,
                tag: tagAround(source, match.index),
            };
        });
    });

    it('finds the emitters', () => {
        expect(emitters.length).toBeGreaterThan(20);
    });

    it('each carries its payload on the same element', () => {
        expect(emitters.filter((e) => !e.tag.includes('data-wh40k-tooltip-data=')).map((e) => e.at)).toEqual([]);
    });

    it('each names a type the tooltip builds', () => {
        expect(emitters.filter((e) => !TOOLTIP_TYPES.has(e.type)).map((e) => `${e.at} ${e.type}`)).toEqual([]);
    });

    it('none is taken out of the Tab order', () => {
        expect(emitters.filter((e) => e.tag.includes('tabindex="-1"')).map((e) => e.at)).toEqual([]);
    });

    // #693: a `title` stacks the browser's own tooltip over the rich one; the accessible name is an aria-label.
    it('none also carries a native title', () => {
        expect(emitters.filter((e) => /\stitle="/u.test(e.tag)).map((e) => e.at)).toEqual([]);
    });

    it('the tooltip system opens them on hover and focus, and makes rendered ones focusable', () => {
        const tooltips = readRepoFile('src/module/applications/components/wh40k-tooltip.ts');
        expect(tooltips).toContain('activateRichTooltips(document, getTooltipManager)');
        expect(tooltips).toContain("Hooks.on('renderApplicationV2'");
        expect(tooltips).toContain("Hooks.on('renderChatMessageHTML'");
        expect(tooltips.match(/makeRichTooltipsFocusable\(/gu)?.length).toBe(3);
    });
});
