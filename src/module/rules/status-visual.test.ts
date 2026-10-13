import { describe, expect, it } from 'vitest';
import {
    desiredStatusVisuals,
    diffStatusVisuals,
    hasStatusVisual,
    type KeyedStatusVisual,
    readStatusVisual,
    type StatusVisual,
    stackIntensity,
    statusVisualKey,
    statusVisualMode,
    statusVisualOf,
    statusVisualSources,
} from './status-visual.ts';

/** The condition → token-visual mapping (#595): one vocabulary for every line. */

const NONE = readStatusVisual(null);

function visual(overrides: Partial<StatusVisual> = {}): StatusVisual {
    return { ...NONE, preset: 'burning', ...overrides };
}

describe('readStatusVisual / statusVisualOf', () => {
    it('reads nothing as no visual', () => {
        expect(NONE).toEqual({ preset: '', tint: '', filter: '', overlay: '', intensity: { perStack: 0, max: 1 }, sounds: [] });
        expect(hasStatusVisual(NONE)).toBe(false);
    });

    it('keeps an authored block and drops what it does not recognise, never guessing', () => {
        expect(
            readStatusVisual({
                preset: 'on-fire',
                tint: 'orange',
                filter: 'sepia',
                overlay: '  ',
                intensity: { perStack: -1, max: 99 },
                sounds: [
                    { event: 'apply', src: 'whoosh.ogg' },
                    { event: 'tick', src: 'crackle.ogg' },
                ],
            }),
        ).toEqual({ preset: '', tint: '', filter: '', overlay: '', intensity: { perStack: 0, max: 3 }, sounds: [{ event: 'apply', src: 'whoosh.ogg' }] });
    });

    it('reads the visual off an untyped condition payload (a pack-index row or an owned item)', () => {
        const read = statusVisualOf({
            identifier: 'on-fire',
            visual: { preset: 'burning', tint: '#FF2200', filter: 'dim', overlay: 'flames.webm', intensity: { perStack: 0.5, max: 2 }, sounds: [] },
        });
        expect(read).toEqual({ preset: 'burning', tint: '#ff2200', filter: 'dim', overlay: 'flames.webm', intensity: { perStack: 0.5, max: 2 }, sounds: [] });
        expect(hasStatusVisual(read)).toBe(true);
        expect(statusVisualOf({ identifier: 'prone' })).toEqual(NONE);
        expect(statusVisualOf({ visual: 'burning' })).toEqual(NONE);
        expect(statusVisualOf(undefined)).toEqual(NONE);
    });

    it('treats a filter or an overlay alone as a visual, and sounds alone as none', () => {
        expect(hasStatusVisual(readStatusVisual({ filter: 'desaturate' }))).toBe(true);
        expect(hasStatusVisual(readStatusVisual({ overlay: 'mist.webp' }))).toBe(true);
        expect(hasStatusVisual(readStatusVisual({ sounds: [{ event: 'apply', src: 'a.ogg' }] }))).toBe(false);
    });
});

describe('stackIntensity', () => {
    it('adds perStack for each stack past the first, up to the authored max', () => {
        const stacking = visual({ intensity: { perStack: 0.5, max: 2 } });
        expect(stackIntensity(stacking, 1)).toBe(1);
        expect(stackIntensity(stacking, 2)).toBe(1.5);
        expect(stackIntensity(stacking, 5)).toBe(2);
    });

    it('stays at 1 for a visual that does not change with stacks', () => {
        expect(stackIntensity(visual(), 4)).toBe(1);
        expect(stackIntensity(visual({ intensity: { perStack: 1, max: 3 } }), Number.NaN)).toBe(1);
    });
});

describe('statusVisualSources / desiredStatusVisuals', () => {
    const catalog: Record<string, StatusVisual> = {
        'on-fire': visual({ intensity: { perStack: 0.5, max: 3 } }),
        'bleeding': visual({ preset: 'bleeding' }),
    };
    const catalogVisual = (id: string): StatusVisual => catalog[id] ?? NONE;

    it('counts each effect conferring a status as a stack, and owned condition items by their stacks', () => {
        const sources = statusVisualSources(
            {
                appliedEffects: [{ statuses: new Set(['on-fire']) }, { statuses: new Set(['on-fire', 'dead']) }],
                items: [
                    { type: 'condition', system: { identifier: 'on-fire', stackable: true, stacks: 2 } },
                    { type: 'weapon', system: { identifier: 'on-fire' } },
                ],
            },
            catalogVisual,
        );
        const desired = desiredStatusVisuals(sources);
        expect([...desired.keys()]).toEqual(['on-fire']);
        expect(desired.get('on-fire')).toMatchObject({ stacks: 4, intensity: 2.5 });
    });

    it("falls back to an owned condition item's own authored visual when the catalog has none", () => {
        const desired = desiredStatusVisuals(
            statusVisualSources({ items: [{ type: 'condition', system: { identifier: 'homebrew-hex', visual: { preset: 'warp' } } }] }, catalogVisual),
        );
        expect(desired.get('homebrew-hex')?.visual.preset).toBe('warp');
    });

    it('a non-stackable condition item counts once, whatever its stacks field says', () => {
        const desired = desiredStatusVisuals(
            statusVisualSources({ items: [{ type: 'condition', system: { identifier: 'bleeding', stackable: false, stacks: 3 } }] }, catalogVisual),
        );
        expect(desired.get('bleeding')?.stacks).toBe(1);
    });

    it('leaves out a status with no visual', () => {
        expect(desiredStatusVisuals(statusVisualSources({ appliedEffects: [{ statuses: ['dead', 'prone'] }] }, catalogVisual)).size).toBe(0);
    });
});

describe('statusVisualMode', () => {
    const on = { worldEnabled: true, enabled: true, userIntensity: 1, reducedMotion: false, visible: true };

    it('animates by default', () => {
        expect(statusVisualMode(on)).toBe('animated');
    });

    it('keeps only the still parts under reduced motion', () => {
        expect(statusVisualMode({ ...on, reducedMotion: true })).toBe('static');
    });

    it.each([['worldEnabled'], ['enabled'], ['visible']] as const)('shows nothing with %s off', (key) => {
        expect(statusVisualMode({ ...on, [key]: false })).toBe('none');
    });

    it('shows nothing at zero intensity', () => {
        expect(statusVisualMode({ ...on, userIntensity: 0 })).toBe('none');
    });
});

describe('diffStatusVisuals', () => {
    function keyed(id: string, intensity: number, look: StatusVisual = visual(), mode: 'animated' | 'static' = 'animated'): [string, KeyedStatusVisual] {
        return [id, { desired: { id, visual: look, stacks: 1, intensity }, mode, key: statusVisualKey(look, mode) }];
    }

    it('starts the new, updates a changed intensity, restarts a changed look or mode, and stops the gone', () => {
        const running = new Map([
            ['on-fire', { key: statusVisualKey(visual(), 'animated'), intensity: 1 }],
            ['bleeding', { key: statusVisualKey(visual({ preset: 'bleeding' }), 'animated'), intensity: 1 }],
            ['prone', { key: statusVisualKey(visual({ preset: 'prone' }), 'animated'), intensity: 1 }],
            ['stunned', { key: statusVisualKey(visual({ preset: 'stunned' }), 'animated'), intensity: 1 }],
        ]);
        const desired = new Map([
            keyed('on-fire', 2),
            keyed('bleeding', 1, visual({ preset: 'bleeding', tint: '#ff0000' })),
            keyed('prone', 1, visual({ preset: 'prone' }), 'static'),
            keyed('pinned', 1, visual({ preset: 'pinned' })),
        ]);
        const diff = diffStatusVisuals(running, desired);
        expect(diff.start.map((next) => next.desired.id)).toEqual(['pinned']);
        expect(diff.update.map((next) => next.desired.id)).toEqual(['on-fire']);
        expect(diff.restart.map((next) => next.desired.id)).toEqual(['bleeding', 'prone']);
        expect(diff.stop).toEqual(['stunned']);
    });

    it('does nothing when the token already shows what it should', () => {
        const running = new Map([['on-fire', { key: statusVisualKey(visual(), 'animated'), intensity: 1 }]]);
        expect(diffStatusVisuals(running, new Map([keyed('on-fire', 1)]))).toEqual({ start: [], update: [], restart: [], stop: [] });
    });
});
