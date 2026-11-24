/**
 * #762: every button on a chat card carries a Foundry `data-tooltip` saying what
 * it does, and none hides its explanation in a plain `title` (a slow native
 * browser hint). Source scan over every chat template.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_ROOT = join(__dirname, '..', 'src', 'templates', 'chat');

/** Every `.hbs` file under a directory. */
function templates(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return templates(path);
        return path.endsWith('.hbs') ? [path] : [];
    });
}

/** Each `<button …>` opening tag in a template, with its file. */
const BUTTONS = templates(CHAT_ROOT).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/<button\b[^>]*>/gs)].map((match) => ({ file: relative(CHAT_ROOT, file), tag: match[0] })),
);

describe('chat-card button tooltips (#762)', () => {
    it('finds the chat buttons to check', () => {
        expect(BUTTONS.length).toBeGreaterThan(30);
    });

    it('every chat-card button has a data-tooltip', () => {
        const missing = BUTTONS.filter((b) => !b.tag.includes('data-tooltip')).map((b) => `${b.file}: ${b.tag.slice(0, 80)}`);
        expect(missing).toEqual([]);
    });

    it('no chat-card button explains itself with a plain title', () => {
        const titled = BUTTONS.filter((b) => /\stitle="/.test(b.tag)).map((b) => `${b.file}: ${b.tag.slice(0, 80)}`);
        expect(titled).toEqual([]);
    });
});
