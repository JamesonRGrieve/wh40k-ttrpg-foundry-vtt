import { describe, expect, it } from 'vitest';
import {
    degreesOfSuccess,
    resolveBreakGrapple,
    resolveDamageOpponent,
    resolveMoveWhileGrappling,
    resolveStandUpInGrapple,
    resolveThrowDownOpponent,
} from './grapple';

/**
 * Grapple state-machine resolver pins (#120 — core.md L10155-10180).
 *
 * The five exported resolvers all share the same opposed-Strength engine,
 * so the tests pin: (a) the DoS math, (b) the action-tag round-trip, and
 * (c) the win/loss semantics at the boundary cases (actor passes /
 * opponent fails, both pass with different DoS, both fail, tie). The
 * resolvers differ only by the `action` tag echoed back — that tag drives
 * downstream chat rendering, so it MUST round-trip unchanged.
 */
describe('grapple — degrees of success', () => {
    it('returns 0 when the roll exceeds the target', () => {
        expect(degreesOfSuccess(75, 40)).toBe(0);
    });

    it('returns 1 for a bare pass (roll exactly equals target)', () => {
        expect(degreesOfSuccess(40, 40)).toBe(1);
    });

    it('returns 1 per full 10 points the roll beats the target by', () => {
        expect(degreesOfSuccess(30, 40)).toBe(2);
        expect(degreesOfSuccess(11, 40)).toBe(3);
        expect(degreesOfSuccess(1, 40)).toBe(4);
    });
});

describe('grapple — resolveDamageOpponent', () => {
    it('controller wins when controller passes and target fails', () => {
        const r = resolveDamageOpponent({ actorRoll: 30, actorStrength: 50, opponentRoll: 75, opponentStrength: 40 });
        expect(r.success).toBe(true);
        expect(r.actorDoS).toBe(3);
        expect(r.opponentDoS).toBe(0);
        expect(r.netDoS).toBe(3);
        expect(r.action).toBe('damage-opponent');
    });

    it('controller loses when controlled rolls more DoS', () => {
        const r = resolveDamageOpponent({ actorRoll: 35, actorStrength: 40, opponentRoll: 10, opponentStrength: 40 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(1);
        expect(r.opponentDoS).toBe(4);
        expect(r.netDoS).toBe(-3);
    });
});

describe('grapple — resolveThrowDownOpponent', () => {
    it('passes the action tag through unchanged for the chat layer', () => {
        const r = resolveThrowDownOpponent({ actorRoll: 20, actorStrength: 45, opponentRoll: 50, opponentStrength: 45 });
        expect(r.action).toBe('throw-down-opponent');
        expect(r.success).toBe(true);
    });
});

describe('grapple — resolveBreakGrapple', () => {
    it('controlled side wins when it passes and controller fails', () => {
        const r = resolveBreakGrapple({ actorRoll: 20, actorStrength: 45, opponentRoll: 90, opponentStrength: 50 });
        expect(r.success).toBe(true);
        expect(r.action).toBe('break-free');
    });

    it('controlled side fails when controller scores more DoS', () => {
        const r = resolveBreakGrapple({ actorRoll: 30, actorStrength: 40, opponentRoll: 5, opponentStrength: 45 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(2);
        expect(r.opponentDoS).toBe(5);
    });
});

describe('grapple — resolveStandUpInGrapple', () => {
    it('ties resolve in favor of the actor (DoS equal, both pass)', () => {
        const r = resolveStandUpInGrapple({ actorRoll: 40, actorStrength: 40, opponentRoll: 40, opponentStrength: 40 });
        expect(r.actorDoS).toBe(1);
        expect(r.opponentDoS).toBe(1);
        expect(r.netDoS).toBe(0);
        expect(r.success).toBe(true);
        expect(r.action).toBe('stand-up');
    });

    it('returns failure when actor fails and opponent passes', () => {
        const r = resolveStandUpInGrapple({ actorRoll: 80, actorStrength: 30, opponentRoll: 25, opponentStrength: 40 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(0);
        expect(r.opponentDoS).toBe(2);
    });
});

describe('grapple — resolveMoveWhileGrappling', () => {
    it('both fail → actor still wins (tie at 0 DoS, actor-favoring tie)', () => {
        const r = resolveMoveWhileGrappling({ actorRoll: 95, actorStrength: 35, opponentRoll: 88, opponentStrength: 35 });
        expect(r.actorDoS).toBe(0);
        expect(r.opponentDoS).toBe(0);
        expect(r.success).toBe(true);
        expect(r.action).toBe('move-while-grappling');
    });
});
