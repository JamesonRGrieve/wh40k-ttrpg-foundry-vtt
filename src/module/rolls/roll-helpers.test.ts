import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ChatRuntimeHandle, stubChatRuntime } from '../testing/chat-runtime.ts';
import { emitChatFromTemplate, getDegreeForMode, isD100Success, resolveDegreesMethod } from './roll-helpers.ts';

/**
 * Degrees-of-success method selection (#DoS-mode setting).
 *
 * `getDegreeForMode` returns the ADDITIONAL degrees (the caller adds the base
 * 1 for the success/failure itself):
 *   - Gen 1 (DH1 / DW / RT): floor(|a − b| / 10) — one per full 10 of margin.
 *   - Gen 2 (BC / OW / DH2):  tens(a) − tens(b)   — tens-digit difference.
 *
 * `resolveDegreesMethod` honours the `degrees-mode` world setting: `raw`
 * (default) resolves per game system; `gen1` / `gen2` force one method.
 */

interface SettingsStub {
    get: (system: string, key: string) => string;
}
interface GameStub {
    settings: SettingsStub;
}
function stubMode(mode: string): void {
    vi.stubGlobal('game', { settings: { get: (): string => mode } } satisfies GameStub);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('isD100Success — the single-sourced d100 success rule', () => {
    it('succeeds when the roll is at or below the target', () => {
        expect(isD100Success(35, 50)).toBe(true);
        expect(isD100Success(50, 50)).toBe(true); // exactly on target
    });

    it('fails when the roll is above the target', () => {
        expect(isD100Success(51, 50)).toBe(false);
        expect(isD100Success(99, 50)).toBe(false);
    });

    it('a natural 01 ALWAYS succeeds, even against an impossible target', () => {
        expect(isD100Success(1, 0)).toBe(true);
        expect(isD100Success(1, -30)).toBe(true);
    });

    it('a natural 100 ALWAYS fails, even against a target of 100+', () => {
        expect(isD100Success(100, 100)).toBe(false);
        expect(isD100Success(100, 200)).toBe(false);
    });

    it('honours both naturals at the extremes of the roll-under band', () => {
        // 1 ≤ target trivially, but the natural-01 rule is what guarantees it;
        // 100 > target only when target < 100, the natural-100 rule covers the rest.
        expect(isD100Success(1, 1)).toBe(true);
        expect(isD100Success(100, 99)).toBe(false);
    });
});

describe('getDegreeForMode — additional degrees', () => {
    it('gen1 counts full 10s of the absolute margin', () => {
        expect(getDegreeForMode('gen1', 45, 12)).toBe(3); // floor(33/10)
        expect(getDegreeForMode('gen1', 41, 39)).toBe(0); // floor(2/10)
        expect(getDegreeForMode('gen1', 80, 10)).toBe(7); // floor(70/10)
    });

    it('gen1 is symmetric in its arguments (uses |a − b|)', () => {
        expect(getDegreeForMode('gen1', 12, 45)).toBe(getDegreeForMode('gen1', 45, 12));
    });

    it('gen2 uses the tens-digit difference', () => {
        expect(getDegreeForMode('gen2', 45, 12)).toBe(3); // 4 − 1
        expect(getDegreeForMode('gen2', 41, 39)).toBe(1); // 4 − 3  (diverges from gen1's 0)
        expect(getDegreeForMode('gen2', 80, 10)).toBe(7); // 8 − 1
    });

    it('the two methods diverge inside a single 10-band (the live-game case)', () => {
        // Beating a target by 2 points: Gen 1 = 0 extra, Gen 2 = 1 extra.
        expect(getDegreeForMode('gen1', 41, 39)).not.toBe(getDegreeForMode('gen2', 41, 39));
    });
});

describe('emitChatFromTemplate — the single-sourced template→ChatMessage idiom', () => {
    /** The chat payload the helper hands to `ChatMessage.create`, beyond `content`. */
    interface EmittedPayload {
        user?: string;
        content?: string;
        rollMode?: string;
        speaker?: unknown;
        whisper?: unknown[];
    }

    let chat: ChatRuntimeHandle;

    beforeEach(() => {
        // Echo the rendered template + context so we can assert the helper feeds
        // the right template path and data through to renderTemplate.
        chat = stubChatRuntime({
            userId: 'gm-7',
            renderTemplate: (tpl, context) => `<card tpl="${tpl}">${JSON.stringify(context)}</card>`,
        });
    });

    afterEach(() => {
        chat.restore();
    });

    function lastPayload(): EmittedPayload {
        // The stub stores the full create() payload; only `content` is typed on
        // the shared handle, so narrow to the chat-payload shape for assertions.
        return (chat.created.at(-1) ?? {}) as unknown as EmittedPayload;
    }

    it('renders the named template with the supplied data and posts the result', async () => {
        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/example.hbs', { foo: 'bar', n: 3 });
        const payload = lastPayload();
        expect(payload.content).toBe('<card tpl="systems/wh40k-rpg/templates/chat/example.hbs">{"foo":"bar","n":3}</card>');
    });

    it('defaults to a bare public post — current user, no rollMode, no whisper', async () => {
        await emitChatFromTemplate('tpl.hbs', {});
        const payload = lastPayload();
        expect(payload.user).toBe('gm-7');
        expect(payload.rollMode).toBeUndefined();
        expect(payload.whisper).toBeUndefined();
    });

    it('includes an explicit rollMode and speaker only when provided', async () => {
        const speaker = { actor: 'actor-1', alias: 'Brother Test' };
        await emitChatFromTemplate('tpl.hbs', {}, { rollMode: 'roll', speaker });
        const payload = lastPayload();
        expect(payload.rollMode).toBe('roll');
        expect(payload.speaker).toEqual(speaker);
        // A plain `roll` (public) mode adds no whisper recipients.
        expect(payload.whisper).toBeUndefined();
    });

    it('applies GM whispers when applyWhispers is set and the rollMode is gmroll', async () => {
        await emitChatFromTemplate('tpl.hbs', {}, { rollMode: 'gmroll', applyWhispers: true });
        const payload = lastPayload();
        expect(payload.rollMode).toBe('gmroll');
        // The stub's getWhisperRecipients returns [], so the key is set to an array.
        expect(Array.isArray(payload.whisper)).toBe(true);
    });

    it('honours an explicit user override', async () => {
        await emitChatFromTemplate('tpl.hbs', {}, { user: 'player-3' });
        expect(lastPayload().user).toBe('player-3');
    });
});

describe('resolveDegreesMethod — RAW resolves per system', () => {
    it('raw → gen1 for the FFG 1st-gen lines (DH1, DW, RT)', () => {
        stubMode('raw');
        expect(resolveDegreesMethod('dh1')).toBe('gen1');
        expect(resolveDegreesMethod('dw')).toBe('gen1');
        expect(resolveDegreesMethod('rt')).toBe('gen1');
    });

    it('raw → gen2 for the later lines (BC, OW, DH2) and IM', () => {
        stubMode('raw');
        expect(resolveDegreesMethod('bc')).toBe('gen2');
        expect(resolveDegreesMethod('ow')).toBe('gen2');
        expect(resolveDegreesMethod('dh2')).toBe('gen2');
        expect(resolveDegreesMethod('im')).toBe('gen2');
    });

    it('raw → gen2 for an unknown / undefined system (safe default)', () => {
        stubMode('raw');
        expect(resolveDegreesMethod(undefined)).toBe('gen2');
        expect(resolveDegreesMethod('xx')).toBe('gen2');
    });

    it('gen1 forces the margin method regardless of system', () => {
        stubMode('gen1');
        expect(resolveDegreesMethod('dh2')).toBe('gen1');
        expect(resolveDegreesMethod('bc')).toBe('gen1');
    });

    it('gen2 forces the tens-digit method regardless of system', () => {
        stubMode('gen2');
        expect(resolveDegreesMethod('dh1')).toBe('gen2');
        expect(resolveDegreesMethod('rt')).toBe('gen2');
    });
});
