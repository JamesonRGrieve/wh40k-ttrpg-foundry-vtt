/**
 * Unit tests for the pure trade-proximity selection rule.
 *
 * `selectNearbySources` is the testable core of the proximity gate: given a
 * buyer token and the other tokens on its scene, it returns the configured
 * source NPCs within range, nearest first. The canvas/HUD wrappers around it
 * are thin and exercised in Storybook; the rule itself lives here.
 *
 * transaction-manager is mocked so importing trade-proximity does not drag the
 * ApplicationV2 chain (which destructures `foundry.applications.api` at load)
 * into a headless test.
 */

import { describe, expect, it, vi } from 'vitest';
import { selectNearbySources, TRADE_RANGE_METRES } from '../src/module/transactions/trade-proximity';

vi.mock('../src/module/transactions/transaction-manager.ts', () => ({
    TransactionManager: { isSourceActor: (): boolean => false },
}));

interface FakeActor {
    id: string | null;
    name: string;
}
interface FakeToken {
    id: string;
    actor: FakeActor | null;
}

function tk(tokenId: string, actorId: string | null, name = actorId ?? 'Unnamed'): FakeToken {
    return { id: tokenId, actor: actorId === null ? null : { id: actorId, name } };
}

type BuyerArg = Parameters<typeof selectNearbySources>[0];
type TokenArg = Parameters<typeof selectNearbySources>[1][number];
type DistanceFn = Parameters<typeof selectNearbySources>[3];

// Distance keyed off the candidate token id so each test can place sources.
function distanceBy(map: Record<string, number>): DistanceFn {
    // eslint-disable-next-line no-restricted-syntax -- boundary: selectNearbySources distance callback receives Foundry Token objects; the test cast localises the FakeToken structural shape
    return (_buyer, candidate) => map[(candidate as unknown as FakeToken).id] ?? Infinity;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: selectNearbySources expects Foundry Token instances; tests provide structural FakeToken mocks
const asTokens = (tokens: FakeToken[]): TokenArg[] => tokens as unknown as TokenArg[];
// eslint-disable-next-line no-restricted-syntax -- boundary: selectNearbySources expects a Foundry Token; tests provide a structural FakeToken mock
const asBuyer = (token: FakeToken): BuyerArg => token as unknown as BuyerArg;

describe('selectNearbySources', () => {
    const buyer = tk('t-buyer', 'a-buyer', 'Trooper');

    it('returns only source actors within range, nearest first', () => {
        const tokens = [tk('t-far', 'a-far'), tk('t-near', 'a-near'), tk('t-mid', 'a-mid')];
        const result = selectNearbySources(asBuyer(buyer), asTokens(tokens), () => true, distanceBy({ 't-far': 3, 't-near': 1, 't-mid': 2 }));
        expect(result.map((r) => r.actorId)).toEqual(['a-near', 'a-mid', 'a-far']);
        expect(result[0].distance).toBe(1);
    });

    it('excludes actors that are not configured sources', () => {
        const tokens = [tk('t-1', 'a-1'), tk('t-2', 'a-2')];
        const result = selectNearbySources(asBuyer(buyer), asTokens(tokens), (actor) => actor.id === 'a-2', distanceBy({ 't-1': 1, 't-2': 1 }));
        expect(result.map((r) => r.actorId)).toEqual(['a-2']);
    });

    it('excludes the buyer’s own token', () => {
        const tokens = [tk('t-self', 'a-buyer'), tk('t-src', 'a-src')];
        const result = selectNearbySources(asBuyer(buyer), asTokens(tokens), () => true, distanceBy({ 't-self': 0, 't-src': 1 }));
        expect(result.map((r) => r.actorId)).toEqual(['a-src']);
    });

    it('treats the range cap as inclusive and drops anything beyond it', () => {
        const tokens = [tk('t-edge', 'a-edge'), tk('t-out', 'a-out')];
        const result = selectNearbySources(
            asBuyer(buyer),
            asTokens(tokens),
            () => true,
            distanceBy({ 't-edge': TRADE_RANGE_METRES, 't-out': TRADE_RANGE_METRES + 1 }),
        );
        expect(result.map((r) => r.actorId)).toEqual(['a-edge']);
    });

    it('skips tokens with no actor', () => {
        const tokens = [tk('t-empty', null), tk('t-src', 'a-src')];
        const result = selectNearbySources(asBuyer(buyer), asTokens(tokens), () => true, distanceBy({ 't-src': 1 }));
        expect(result.map((r) => r.actorId)).toEqual(['a-src']);
    });

    it('honours a custom range cap', () => {
        const tokens = [tk('t-a', 'a-a'), tk('t-b', 'a-b')];
        const result = selectNearbySources(asBuyer(buyer), asTokens(tokens), () => true, distanceBy({ 't-a': 5, 't-b': 12 }), 6);
        expect(result.map((r) => r.actorId)).toEqual(['a-a']);
    });
});
