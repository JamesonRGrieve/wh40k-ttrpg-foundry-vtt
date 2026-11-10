/**
 * #703: the world-time widget can undo the last advance. The pure rules (which
 * record applies, which fatigue and effects come back), the runtime that winds
 * the clock back and restores them, and the widget's Undo button.
 */

import HbsStory from 'handlebars';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    canUndoAdvance,
    expiredByAdvance,
    fatigueToRestore,
    type LastAdvance,
    parseLastAdvance,
    type TimedEffectState,
} from '../src/module/rules/world-time-undo.ts';
import widgetSrc from '../src/templates/hud/world-time-widget.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

const settings = vi.hoisted(() => ({ record: null as LastAdvance | null }));

vi.mock('../src/module/wh40k-rpg-settings.ts', () => ({
    WH40KSettings: {
        getLastWorldTimeAdvance: () => settings.record,
        setLastWorldTimeAdvance: async (record: LastAdvance | null) => {
            settings.record = record;
            await Promise.resolve();
        },
    },
}));

const HOUR = 3600;
const DAY = 24 * HOUR;
const RECORD: LastAdvance = { from: 1000, to: 1000 + DAY, fatigue: [{ actorId: 'shade', before: 3, after: 1 }] };

describe('parseLastAdvance', () => {
    it('reads a stored record', () => {
        expect(parseLastAdvance(RECORD)).toEqual(RECORD);
    });

    it('drops malformed fatigue entries and keeps the rest', () => {
        const raw = {
            from: 0,
            to: HOUR,
            fatigue: [{ actorId: 'a', before: 2, after: 1 }, { actorId: '', before: 1, after: 0 }, { actorId: 'b', before: 'x', after: 0 }, null],
        };
        expect(parseLastAdvance(raw)?.fatigue).toEqual([{ actorId: 'a', before: 2, after: 1 }]);
    });

    it.each([
        ['null', null],
        ['a string', 'advance'],
        ['no times', { fatigue: [] }],
        ['a backward move', { from: HOUR, to: 0, fatigue: [] }],
        ['no move', { from: HOUR, to: HOUR, fatigue: [] }],
        ['a non-finite time', { from: 0, to: Number.POSITIVE_INFINITY, fatigue: [] }],
    ])('reads %s as no record', (_label, raw) => {
        expect(parseLastAdvance(raw)).toBeNull();
    });

    it('reads a record with no fatigue list as no fatigue changes', () => {
        expect(parseLastAdvance({ from: 0, to: HOUR })).toEqual({ from: 0, to: HOUR, fatigue: [] });
    });
});

describe('canUndoAdvance', () => {
    it('applies while the clock sits where the advance left it', () => {
        expect(canUndoAdvance(RECORD, RECORD.to)).toBe(true);
    });

    it('refuses once the clock has moved on, or with no record', () => {
        expect(canUndoAdvance(RECORD, RECORD.to + 1)).toBe(false);
        expect(canUndoAdvance(RECORD, RECORD.from)).toBe(false);
        expect(canUndoAdvance(null, RECORD.to)).toBe(false);
    });
});

describe('fatigueToRestore', () => {
    const record: LastAdvance = {
        from: 0,
        to: DAY,
        fatigue: [
            { actorId: 'shade', before: 3, after: 1 },
            { actorId: 'tyr', before: 2, after: 0 },
            { actorId: 'gone', before: 1, after: 0 },
        ],
    };

    it('restores each level still at its after-advance value, and leaves one changed since', () => {
        const levels = new Map([
            ['shade', 1],
            ['tyr', 4],
        ]);
        expect(fatigueToRestore(record, (id) => levels.get(id) ?? null)).toEqual([{ actorId: 'shade', before: 3, after: 1 }]);
    });
});

describe('expiredByAdvance', () => {
    const effect = (over: Partial<TimedEffectState>): TimedEffectState => ({ expired: true, timeBased: true, startTime: 0, seconds: 1000 + HOUR, ...over });

    it('is true for a time-based effect that ran out inside the advanced window', () => {
        expect(expiredByAdvance(effect({}), RECORD)).toBe(true);
        // Ending exactly at the advance's end counts: it ran out on arrival.
        expect(expiredByAdvance(effect({ seconds: RECORD.to }), RECORD)).toBe(true);
    });

    it('is false for an effect that had run out before the advance', () => {
        expect(expiredByAdvance(effect({ seconds: RECORD.from }), RECORD)).toBe(false);
    });

    it('is false for an effect that ends after the advance, is not expired, is combat-timed or has no start', () => {
        expect(expiredByAdvance(effect({ seconds: RECORD.to + 1 }), RECORD)).toBe(false);
        expect(expiredByAdvance(effect({ expired: false }), RECORD)).toBe(false);
        expect(expiredByAdvance(effect({ timeBased: false }), RECORD)).toBe(false);
        expect(expiredByAdvance(effect({ startTime: null }), RECORD)).toBe(false);
    });
});

/* -------------------------------------------- */
/*  Runtime                                     */
/* -------------------------------------------- */

interface FakeEffect {
    _source: { duration: { expired: boolean } };
    start: { time: number } | null;
    duration: { units: string; seconds: number };
    update: ReturnType<typeof vi.fn>;
}

function fakeEffect(end: number, expired = true, units = 'seconds'): FakeEffect {
    return { _source: { duration: { expired } }, start: { time: 0 }, duration: { units, seconds: end }, update: vi.fn().mockResolvedValue(undefined) };
}

interface FakeActor {
    id: string;
    fatigueLevel: number | null;
    restoreFatigueLevel: ReturnType<typeof vi.fn>;
    allApplicableEffects: () => FakeEffect[];
}

function fakeActor(id: string, level: number | null, effects: FakeEffect[] = []): FakeActor {
    return { id, fatigueLevel: level, restoreFatigueLevel: vi.fn().mockResolvedValue(undefined), allApplicableEffects: () => effects };
}

describe('undoLastWorldTimeAdvance', () => {
    let clock: { worldTime: number; advance: ReturnType<typeof vi.fn> };
    const registryAdd = vi.fn<(effect: FakeEffect) => void>();

    function stubWorld(actors: FakeActor[], tokens: Array<{ actorLink: boolean; actor: FakeActor | null }> = []): void {
        clock = {
            worldTime: RECORD.to,
            advance: vi.fn(async (delta: number) => {
                clock.worldTime += delta;
                await Promise.resolve();
                return clock.worldTime;
            }),
        };
        vi.stubGlobal('game', { time: clock, actors: { contents: actors }, scenes: { contents: [{ tokens: { contents: tokens } }] } });
        vi.stubGlobal('CONST', { ACTIVE_EFFECT_TIME_DURATION_UNITS: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'] });
        vi.stubGlobal('foundry', { documents: { ActiveEffect: { registry: { add: registryAdd } } } });
    }

    beforeEach(() => {
        settings.record = structuredClone(RECORD);
        registryAdd.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('winds the clock back over the advance and drops the record', async () => {
        stubWorld([]);
        const { undoLastWorldTimeAdvance } = await import('../src/module/rules/world-time-undo-runtime.ts');
        const outcome = await undoLastWorldTimeAdvance();
        expect(clock.advance).toHaveBeenCalledWith(-DAY);
        expect(clock.worldTime).toBe(RECORD.from);
        expect(settings.record).toBeNull();
        expect(outcome).toEqual({ kind: 'undone', seconds: DAY, fatigueRestored: 0, effectsRestored: 0 });
    });

    it('takes back fatigue the advance recovered, unless it changed since', async () => {
        const shade = fakeActor('shade', 1);
        settings.record = { ...RECORD, fatigue: [...RECORD.fatigue, { actorId: 'tyr', before: 2, after: 0 }] };
        const tyr = fakeActor('tyr', 5);
        stubWorld([shade, tyr]);
        const { undoLastWorldTimeAdvance } = await import('../src/module/rules/world-time-undo-runtime.ts');
        const outcome = await undoLastWorldTimeAdvance();
        expect(shade.restoreFatigueLevel).toHaveBeenCalledWith(3);
        expect(tyr.restoreFatigueLevel).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ fatigueRestored: 1 });
    });

    it('brings back effects that ran out during the advance, on world actors and unlinked tokens', async () => {
        const ranOut = fakeEffect(RECORD.from + HOUR);
        const earlier = fakeEffect(RECORD.from - HOUR);
        const rounds = fakeEffect(RECORD.from + HOUR, true, 'rounds');
        const onToken = fakeEffect(RECORD.to);
        const linked = fakeEffect(RECORD.from + HOUR);
        stubWorld(
            [fakeActor('shade', null, [ranOut, earlier, rounds])],
            [
                { actorLink: false, actor: fakeActor('shade', null, [onToken]) },
                { actorLink: true, actor: fakeActor('tyr', null, [linked]) },
            ],
        );
        const { undoLastWorldTimeAdvance } = await import('../src/module/rules/world-time-undo-runtime.ts');
        const outcome = await undoLastWorldTimeAdvance();
        expect(ranOut.update).toHaveBeenCalledWith({ 'duration.expired': false });
        expect(onToken.update).toHaveBeenCalledWith({ 'duration.expired': false });
        for (const untouched of [earlier, rounds, linked]) expect(untouched.update).not.toHaveBeenCalled();
        expect(registryAdd.mock.calls.map(([e]) => e)).toEqual([ranOut, onToken]);
        expect(outcome).toMatchObject({ effectsRestored: 2 });
    });

    it('rewinds before restoring, so restored effects have time left', async () => {
        const ranOut = fakeEffect(RECORD.from + HOUR);
        stubWorld([fakeActor('shade', null, [ranOut])]);
        const { undoLastWorldTimeAdvance } = await import('../src/module/rules/world-time-undo-runtime.ts');
        await undoLastWorldTimeAdvance();
        const [rewound] = clock.advance.mock.invocationCallOrder;
        const [restored] = ranOut.update.mock.invocationCallOrder;
        expect(rewound).toBeLessThan(restored);
    });

    it('does nothing once the clock has moved on, or with nothing to undo', async () => {
        stubWorld([]);
        clock.worldTime = RECORD.to + HOUR;
        const { undoLastWorldTimeAdvance } = await import('../src/module/rules/world-time-undo-runtime.ts');
        await expect(undoLastWorldTimeAdvance()).resolves.toEqual({ kind: 'stale' });
        expect(clock.advance).not.toHaveBeenCalled();
        expect(settings.record).not.toBeNull();
        settings.record = null;
        await expect(undoLastWorldTimeAdvance()).resolves.toEqual({ kind: 'none' });
    });
});

/* -------------------------------------------- */
/*  Widget button                               */
/* -------------------------------------------- */

describe('the widget Undo button', () => {
    initializeStoryHandlebars();
    const widget = HbsStory.compile(widgetSrc);
    const render = (ctx: object): HTMLElement => {
        const root = document.createElement('div');
        root.innerHTML = widget({ localBodyName: 'Solenne Minoris', localRotationHours: 19, localDay: 5, localTimeOfDay: '07:12', ...ctx });
        return root;
    };

    it('names the step it takes back and is enabled when there is one', () => {
        const button = render({ isGM: true, canUndo: true, undoLabel: 'Undo +1d' }).querySelector<HTMLButtonElement>('[data-action="undoAdvance"]');
        expect(button?.disabled).toBe(false);
        expect(button?.textContent.trim()).toBe('Undo +1d');
    });

    it('explains what else it takes back in its tooltip', () => {
        const button = render({ isGM: true, canUndo: true, undoLabel: 'Undo +1d' }).querySelector<HTMLElement>('[data-action="undoAdvance"]');
        expect(button?.dataset['tooltip']).toContain('Fatigue');
        expect(button?.dataset['tooltip']).toContain('timed effects');
    });

    it('is disabled with nothing to undo', () => {
        const button = render({ isGM: true, canUndo: false, undoLabel: 'Nothing to undo' }).querySelector<HTMLButtonElement>('[data-action="undoAdvance"]');
        expect(button?.disabled).toBe(true);
    });

    it('is absent for players', () => {
        expect(render({ isGM: false, canUndo: true, undoLabel: 'Undo +1d' }).querySelector('[data-action="undoAdvance"]')).toBeNull();
    });
});
