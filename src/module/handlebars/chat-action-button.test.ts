import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatActionButtonClass } from './chat-action-button.ts';

/**
 * Chat-card action buttons stay inside the card. "Replace die with DoS (10)" ran
 * past both edges of the damage card: every action button was `tw-whitespace-nowrap`
 * with no `tw-min-w-0`, so a long uppercase label could not wrap or shrink. The
 * buttons now take their classes from the shared `chatActionButton` helper, which
 * lets them shrink and wraps the label, and no chat-card button may be nowrap
 * without `tw-min-w-0`.
 */

const ROOT = resolve(__dirname, '../../..');
const CHAT_TEMPLATES = join(ROOT, 'src/templates/chat');

function templatesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templatesUnder(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

/** Every `<button …>` opening tag in a chat template, quoted attribute values (which may hold `>`) skipped whole. */
const BUTTON_TAG = /<button\b(?:[^>"]|"[^"]*")*>/g;

const buttons = templatesUnder(CHAT_TEMPLATES).flatMap((path) =>
    Array.from(readFileSync(path, 'utf8').matchAll(BUTTON_TAG), (match) => ({ file: relative(ROOT, path), tag: match[0] })),
);

describe('chatActionButtonClass', () => {
    it('lets the button shrink and wraps its label, centred', () => {
        for (const size of ['md', 'sm']) {
            const classes = chatActionButtonClass('wounds', size).split(' ');
            expect(classes).toEqual(expect.arrayContaining(['tw-min-w-0', 'tw-text-center', 'tw-flex']));
            expect(classes).not.toContain('tw-whitespace-nowrap');
        }
    });

    it('is md by default, and the compact sm row is smaller', () => {
        expect(chatActionButtonClass('gold')).toBe(chatActionButtonClass('gold', 'md'));
        expect(chatActionButtonClass('gold', 'md')).toContain('tw-text-[0.8rem]');
        expect(chatActionButtonClass('gold', 'sm')).toContain('tw-text-[0.7rem]');
    });

    it('gives each tone its palette, and the inert placeholder no hover or pointer', () => {
        expect(chatActionButtonClass('wounds')).toContain('tw-bg-[var(--wh40k-wounds-bg)]');
        expect(chatActionButtonClass('powers')).toContain('tw-bg-[var(--wh40k-powers-bg)]');
        expect(chatActionButtonClass('amber')).toContain('tw-bg-amber-500/20');
        expect(chatActionButtonClass('inert')).toContain('tw-cursor-not-allowed');
        expect(chatActionButtonClass('inert')).not.toContain('hover:');
    });

    it('throws on an unknown tone or size, a template bug', () => {
        expect(() => chatActionButtonClass('chartreuse')).toThrow('unknown tone');
        expect(() => chatActionButtonClass('wounds', 'xl')).toThrow('unknown size');
    });
});

describe('chat-card buttons', () => {
    it('finds the buttons it checks', () => {
        expect(buttons.length).toBeGreaterThan(20);
    });

    it('no button is nowrap without min-w-0', () => {
        const offenders = buttons.filter(({ tag }) => tag.includes('tw-whitespace-nowrap') && !tag.includes('tw-min-w-0'));
        expect(offenders.map(({ file, tag }) => `${file}: ${tag.slice(0, 80)}`)).toEqual([]);
    });

    it('the damage card, the attack card and the roll cards take the shared helper', () => {
        const usesHelper = (file: string): number => buttons.filter((button) => button.file.endsWith(file) && button.tag.includes('chatActionButton')).length;
        expect(usesHelper('damage-roll-chat.hbs')).toBe(2);
        expect(usesHelper('action-roll-chat.hbs')).toBe(7);
        expect(usesHelper('evasion-prompt-chat.hbs')).toBe(3);
        expect(usesHelper('psychic-action-chat.hbs')).toBe(3);
    });
});
