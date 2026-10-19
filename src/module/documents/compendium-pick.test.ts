import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `pickCompendiumItemUuid` (#160, shared with Dark Pacts' Add Pact): offers the
 * compendium Items whose index entry matches, sorted by name, and returns the
 * chosen one's UUID. The pack index and the choice prompt are mocked.
 */

interface IndexEntry {
    _id: string;
    name: string;
    type?: string;
    uuid?: string;
}
type Collect = (entry: IndexEntry, pack: { metadata: { id: string; label: string } }) => { id: string; name: string } | undefined;

const PACK = { metadata: { id: 'wh40k-rpg.ow-drawbacks', label: 'Drawbacks' } };
const ENTRIES: IndexEntry[] = [
    { _id: 'b', name: 'The Few', type: 'originPath', uuid: 'Compendium.wh40k-rpg.ow-drawbacks.Item.b' },
    { _id: 'a', name: 'Doomed', type: 'originPath' },
    { _id: 'c', name: 'Lasgun', type: 'weapon' },
];

const queryItemIndex = vi.fn(async (_fields: string[], collect: Collect) =>
    Promise.resolve(ENTRIES.map((entry) => collect(entry, PACK)).filter((value) => value !== undefined)),
);
const promptItemChoice = vi.fn(async (items: Array<{ id: string; name: string }>) => Promise.resolve(items.at(0) ?? null));

vi.mock('../utils/compendium-query.ts', () => ({ queryItemIndex }));
vi.mock('../rolls/skill-use-picker.ts', () => ({ promptItemChoice }));

const { pickCompendiumItemUuid } = await import('./compendium-pick.ts');

beforeEach(() => {
    queryItemIndex.mockClear();
    promptItemChoice.mockClear();
});

describe('pickCompendiumItemUuid', () => {
    it('offers the matching items sorted by name, each by its UUID, and returns the chosen one', async () => {
        const uuid = await pickCompendiumItemUuid(['type'], (entry) => entry.type === 'originPath', 'Title', 'Hint');
        expect(queryItemIndex).toHaveBeenCalledWith(['type'], expect.any(Function), true);
        expect(promptItemChoice).toHaveBeenCalledWith(
            [
                { id: 'Compendium.wh40k-rpg.ow-drawbacks.Item.a', name: 'Doomed' },
                { id: 'Compendium.wh40k-rpg.ow-drawbacks.Item.b', name: 'The Few' },
            ],
            'Title',
            'Hint',
        );
        expect(uuid).toBe('Compendium.wh40k-rpg.ow-drawbacks.Item.a');
    });

    it('returns null, without prompting, when nothing matches', async () => {
        expect(await pickCompendiumItemUuid(['type'], () => false, 'Title', 'Hint')).toBeNull();
        expect(promptItemChoice).not.toHaveBeenCalled();
    });

    it('returns null when the choice is dismissed', async () => {
        promptItemChoice.mockResolvedValueOnce(null);
        expect(await pickCompendiumItemUuid(['type'], (entry) => entry.type === 'originPath', 'Title', 'Hint')).toBeNull();
    });
});
