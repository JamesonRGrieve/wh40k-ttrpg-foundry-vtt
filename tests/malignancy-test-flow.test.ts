/**
 * The Malignancy Test flow (Corruption Track lines: DH1 / DH2 / OW / RT).
 *
 * A Corruption gain queues one test per 10 CP crossed (`WH40KAcolyte._preUpdate`),
 * the sheet surfaces the owed count, and rolling one goes through the unified roll
 * pipeline as a `MalignancyTestActionData`. Two behaviours here are load-bearing:
 *
 * 1. **The queue is spent by the roll, and returned by a re-roll.** The spend rides
 *    the pipeline's resource hooks, so a Fate re-roll (refund → re-run) never costs
 *    two owed tests. That needed `refundResources` to stop calling the ammo refund
 *    for non-weapon rolls — it threw on `rollData.weapon` being absent, so a re-roll
 *    of ANY skill/characteristic test died before it re-rolled.
 * 2. **Only a failure draws a Malignancy**, from the rolling line's own table.
 *
 * The Document and sheet cannot load under happy-dom (they extend Foundry classes),
 * so their wiring is checked against source text, as for the Navigator powers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { buildApplicationV2Api, type ApplicationV2Api } from '../src/module/testing/app-v2-stub.ts';

interface FoundryStub {
    applications: { api: ApplicationV2Api; handlebars: { renderTemplate: () => Promise<string> } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with framework-defined key/value types.
    utils: { Collection: new () => Map<unknown, unknown> };
}
interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
    settings: { get: () => boolean };
    wh40k: { log: () => void; error: () => void };
}
interface FoundryStubs {
    foundry?: FoundryStub | undefined;
    game?: GameStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as FoundryStubs;
const ORIGINAL = { foundry: stubs.foundry, game: stubs.game };

stubs.foundry = {
    applications: { api: buildApplicationV2Api(), handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') } },
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's foundry.utils.Collection extends Map with arbitrary key/value types per the framework type.
    utils: { Collection: class FakeCollection extends Map<unknown, unknown> {} },
};
stubs.game = {
    i18n: { localize: (key: string): string => key, format: (key: string): string => key },
    settings: { get: (): boolean => false },
    wh40k: {
        log: (): void => {
            /* noop */
        },
        error: (): void => {
            /* noop */
        },
    },
};

// Imports must come AFTER the stubs so module-init code finds the shims.
const { MalignancyTestActionData } = await import('../src/module/rolls/action-data.ts');
const { RollTableUtils } = await import('../src/module/utils/roll-table-utils.ts');

afterAll(() => {
    Object.assign(stubs, ORIGINAL);
});

/** A ledger that records every spend and refund. */
function makeLedger(): { moves: number[]; consume: () => Promise<void>; refund: () => Promise<void> } {
    const moves: number[] = [];
    return {
        moves,
        consume: async (): Promise<void> => {
            moves.push(-1);
            return Promise.resolve();
        },
        refund: async (): Promise<void> => {
            moves.push(1);
            return Promise.resolve();
        },
    };
}

describe('MalignancyTestActionData', () => {
    let rollMalignancy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        rollMalignancy = vi.spyOn(RollTableUtils, 'rollMalignancy').mockResolvedValue(null);
    });

    it('spends one owed test when the roll resolves, and returns it on a re-roll refund', async () => {
        const ledger = makeLedger();
        const action = new MalignancyTestActionData(ledger, 'dh2');
        await action.useResources();
        await action.refundResources();
        expect(ledger.moves).toEqual([-1, 1]);
    });

    it('a passed test resists — no Malignancies roll', async () => {
        const action = new MalignancyTestActionData(makeLedger(), 'dh2');
        action.rollData.success = true;
        await action.descriptionText();
        expect(rollMalignancy).not.toHaveBeenCalled();
        expect(JSON.stringify(action.effectOutput)).toContain('WH40K.Malignancy.Resisted');
    });

    it("a failed test draws from the rolling line's Malignancies table", async () => {
        const action = new MalignancyTestActionData(makeLedger(), 'ow');
        action.rollData.success = false;
        await action.descriptionText();
        expect(rollMalignancy).toHaveBeenCalledWith('ow');
        expect(JSON.stringify(action.effectOutput)).toContain('WH40K.Malignancy.Manifests');
    });
});

/**
 * Twisted Flesh (Mutant background): the character may take a rolled mutation
 * instead of a malignancy. A failed test offers the choice; without the bonus
 * nothing is asked.
 */
describe('MalignancyTestActionData — Twisted Flesh (#91)', () => {
    let rollMalignancy: MockInstance<typeof RollTableUtils.rollMalignancy>;
    let rollMutation: MockInstance<typeof RollTableUtils.rollMutation>;
    // The picker offers each choice as a content button whose action is the choice's id (#668).
    const wait = vi.fn<(config: { actions: Record<string, () => Promise<void>> }) => Promise<string | null>>();

    beforeEach(() => {
        vi.restoreAllMocks();
        rollMalignancy = vi.spyOn(RollTableUtils, 'rollMalignancy').mockResolvedValue(null);
        rollMutation = vi.spyOn(RollTableUtils, 'rollMutation').mockResolvedValue(null);
        wait.mockReset();
        Object.assign(stubs.foundry?.applications.api ?? {}, { DialogV2: { wait } });
    });

    it('a Mutant who takes the Mutation rolls the Mutations table instead', async () => {
        wait.mockResolvedValue('mutation');
        const action = new MalignancyTestActionData(makeLedger(), 'dh2', true);
        action.rollData.success = false;
        await action.descriptionText();
        expect(Object.keys(wait.mock.calls[0]?.[0].actions ?? {})).toEqual(['malignancy', 'mutation']);
        expect(rollMutation).toHaveBeenCalledWith('dh2');
        expect(rollMalignancy).not.toHaveBeenCalled();
        expect(JSON.stringify(action.effectOutput)).toContain('WH40K.Malignancy.TwistedFlesh.MutationInstead');
    });

    it('a Mutant who keeps the Malignancy, or dismisses the choice, draws the Malignancy', async () => {
        for (const answer of ['malignancy', null]) {
            rollMalignancy.mockClear();
            wait.mockResolvedValueOnce(answer);
            const action = new MalignancyTestActionData(makeLedger(), 'dh2', true);
            action.rollData.success = false;
            // eslint-disable-next-line no-await-in-loop -- each case resolves its own failed test in turn
            await action.descriptionText();
            expect(rollMalignancy).toHaveBeenCalledWith('dh2');
        }
        expect(rollMutation).not.toHaveBeenCalled();
    });

    it('without Twisted Flesh a failure asks nothing', async () => {
        const action = new MalignancyTestActionData(makeLedger(), 'dh2');
        action.rollData.success = false;
        await action.descriptionText();
        expect(wait).not.toHaveBeenCalled();
        expect(rollMalignancy).toHaveBeenCalledWith('dh2');
    });
});

describe("Malignancies table lookup in the rolling line's pack", () => {
    /** One of `line`'s RollTable packs whose index holds a single entry. */
    function tablePack(line: string, name: string): object {
        const table = { name };
        return {
            documentName: 'RollTable',
            metadata: { name: `${line}-tables`, flags: { 'wh40k-rpg': { line, category: 'rolltables', homebrew: false } } },
            getIndex: async (): Promise<{ _id: string; name: string }[]> => Promise.resolve([{ _id: 't1', name }]),
            getDocument: async (): Promise<object> => Promise.resolve(table),
        };
    }

    it('finds a table printed in capitals (Only War: "MALIGNANCIES")', async () => {
        vi.stubGlobal('game', {
            packs: [tablePack('dh2', 'Malignancies'), tablePack('ow', 'MALIGNANCIES')],
        });
        try {
            const found = await RollTableUtils.findTableInCompendiums('Malignancies', 'ow');
            expect(found).toEqual({ name: 'MALIGNANCIES' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('Malignancy Test wiring (source text)', () => {
    const acolyteSrc = readFileSync(resolve(__dirname, '../src/module/documents/acolyte.ts'), 'utf8');
    const sheetSrc = readFileSync(resolve(__dirname, '../src/module/applications/actor/character-sheet.ts'), 'utf8');
    const vitalsSrc = readFileSync(resolve(__dirname, '../src/templates/actor/panel/overview-vitals-panel.hbs'), 'utf8');

    it('queues tests from a Corruption gain in the same update', () => {
        const start = acolyteSrc.indexOf('protected override async _preUpdate(');
        expect(start).toBeGreaterThan(-1);
        const body = acolyteSrc.slice(start, acolyteSrc.indexOf('\n    /**', start));
        expect(body).toContain('malignancyTestsQueued(');
        expect(body).toContain('this.usesMalignancyTest');
    });

    /** The source of one acolyte member, up to the next doc comment. */
    function member(signature: string): string {
        const start = acolyteSrc.indexOf(signature);
        expect(start).toBeGreaterThan(-1);
        return acolyteSrc.slice(start, acolyteSrc.indexOf('\n    /**', start));
    }

    it('rolls through the unified pipeline with the Corruption Track as a named row', () => {
        const body = member('#openMalignancyTest(): void');
        expect(body).toContain("'corruption-track': corruptionTrackModifier(");
        expect(body).toContain('new MalignancyTestActionData(ledger, this.system.gameSystem, this.hasTwistedFlesh)');
        expect(body).toContain('openRollPrompt(');
    });

    it('offers a Twisted Flesh Mutant the choice to fail before rolling (#91)', () => {
        expect(member('rollMalignancyTest(): void')).toContain('this.hasTwistedFlesh');
        const offer = member('async #offerTwistedFleshFailure(): Promise<void>');
        // Resisting opens the normal test; choosing to fail spends the owed test with no roll.
        expect(offer).toContain("choice.id === 'resist'");
        expect(offer).toContain('this.#openMalignancyTest()');
        expect(offer).toContain('this.#adjustMalignancyTests(-1)');
        expect(offer).toContain('resolveGainedMalignancy(this.system.gameSystem, true)');
        expect(offer).not.toContain('openRollPrompt(');
    });

    it('reads Twisted Flesh from the flag the Mutant background dialog sets', () => {
        const dialogSrc = readFileSync(resolve(__dirname, '../src/module/applications/prompts/mutant-background-dialog.ts'), 'utf8');
        expect(dialogSrc).toContain('setFlag(SYSTEM_ID, TWISTED_FLESH_FLAG, true)');
        expect(member('get hasTwistedFlesh(): boolean')).toContain('this.getFlag(SYSTEM_ID, TWISTED_FLESH_FLAG) === true');
    });

    it('surfaces owed tests on the sheet as a rollable button', () => {
        expect(sheetSrc).toContain("'rollMalignancyTest': CharacterSheet.#rollMalignancyTest");
        expect(sheetSrc).toContain('context.malignancyTestsDue');
        expect(vitalsSrc).toContain('data-action="rollMalignancyTest"');
    });
});
