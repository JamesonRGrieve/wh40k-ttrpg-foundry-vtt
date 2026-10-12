import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { isActorOnLine } from './actor-line-gate.ts';
import { bcAscend } from './bc-daemon-prince-actions.ts';
import { bcPsychicTest } from './bc-psychic-actions.ts';
import { bcPerformRitual } from './bc-ritual-actions.ts';

/**
 * Regression (#596): the BC ritual, psychic-test and apotheosis handlers gated
 * on `this.actor._gameSystemId`, a SHEET property the actor never has, so they
 * returned on every actor and their buttons did nothing. They now gate on the
 * actor's own `system.gameSystem`: a BC actor reaches the dialog (or, for an
 * unclaimed apotheosis, its below-threshold notice) and a DH2 actor does not.
 */

const prompt = vi.fn();
const warn = vi.fn();

beforeEach(() => {
    prompt.mockReset().mockResolvedValue(null);
    warn.mockReset();
    vi.stubGlobal('foundry', { applications: { api: { DialogV2: { prompt } } } });
    vi.stubGlobal('game', { i18n: { localize: (key: string): string => key, format: (key: string): string => key } });
    vi.stubGlobal('ui', { notifications: { warn } });
    vi.spyOn(WH40KSettings, 'getApotheosisInfamyThreshold').mockReturnValue(50);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

/** A sheet `this` whose actor carries only `system` — no sheet-level `_gameSystemId` anywhere. */
function sheetFor<T>(system: object): T {
    // eslint-disable-next-line no-restricted-syntax -- boundary: stub of the Foundry Actor document the handlers' `this.actor` intersects; only `system` is read before the dialog opens
    return { actor: { system } } as unknown as T;
}

const click = new Event('click');
const target = document.createElement('button');

describe('isActorOnLine (#596)', () => {
    it("reads the actor's own system.gameSystem", () => {
        expect(isActorOnLine({ system: { gameSystem: 'bc' } }, 'bc')).toBe(true);
        expect(isActorOnLine({ system: { gameSystem: 'dh2' } }, 'bc')).toBe(false);
    });
});

describe('bcPerformRitual gate (#596)', () => {
    const ritual = (gameSystem: string): ThisParameterType<typeof bcPerformRitual> => sheetFor({ gameSystem, ritualMastery: 2 });

    it('opens the ritual dialog for a BC actor', async () => {
        await bcPerformRitual.call(ritual('bc'), click, target);
        expect(prompt).toHaveBeenCalledOnce();
    });

    it('does nothing for a DH2 actor', async () => {
        await bcPerformRitual.call(ritual('dh2'), click, target);
        expect(prompt).not.toHaveBeenCalled();
    });
});

describe('bcPsychicTest gate (#596)', () => {
    const psyker = (gameSystem: string): ThisParameterType<typeof bcPsychicTest> =>
        sheetFor({ gameSystem, psykerClass: 'bound', psyRating: 3, sustainedPowerCount: 0 });

    it('opens the psychic-test dialog for a BC actor', async () => {
        await bcPsychicTest.call(psyker('bc'), click, target);
        expect(prompt).toHaveBeenCalledOnce();
    });

    it('does nothing for a DH2 actor', async () => {
        await bcPsychicTest.call(psyker('dh2'), click, target);
        expect(prompt).not.toHaveBeenCalled();
    });
});

describe('bcAscend gate (#596)', () => {
    const champion = (gameSystem: string, corruption: number): ThisParameterType<typeof bcAscend> =>
        sheetFor({
            gameSystem,
            corruption,
            infamy: 60,
            chaosAlignment: 'khorne',
            daemonPrinceAscension: { ascendedAt: null, alignmentAtAscension: 'unaligned', outcome: 'daemonPrince' },
        });

    it('evaluates the claim for a BC actor: below 100 Corruption it warns', async () => {
        await bcAscend.call(champion('bc', 40), click, target);
        expect(warn).toHaveBeenCalledOnce();
        expect(prompt).not.toHaveBeenCalled();
    });

    it('opens the confirmation for a BC actor that has reached 100 Corruption', async () => {
        await bcAscend.call(champion('bc', 100), click, target);
        expect(prompt).toHaveBeenCalledOnce();
    });

    it('does nothing for a DH2 actor', async () => {
        await bcAscend.call(champion('dh2', 100), click, target);
        expect(warn).not.toHaveBeenCalled();
        expect(prompt).not.toHaveBeenCalled();
    });
});
