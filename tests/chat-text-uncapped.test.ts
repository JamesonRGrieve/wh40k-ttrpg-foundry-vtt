/**
 * Chat cards print their rules and effect text whole (#701 audit). A 150px cap
 * with an inner scrollbar cut the text off mid-sentence in the chat log and in
 * every popout; the psychic, damage, condition-tick and force-field cards all
 * carried it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_TEMPLATES = resolve(__dirname, '..', 'src', 'templates', 'chat');

function templates(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templates(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe('chat card text is never capped at 150px', () => {
    it('no chat template caps a text block with max-h-[150px]', () => {
        const capped = templates(CHAT_TEMPLATES).filter((path) => readFileSync(path, 'utf8').includes('tw-max-h-[150px]'));
        expect(capped).toEqual([]);
    });
});
