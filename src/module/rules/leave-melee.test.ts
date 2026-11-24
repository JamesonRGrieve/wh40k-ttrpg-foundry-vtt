import { describe, expect, it } from 'vitest';
import type { EngagementToken } from './engagement.ts';
import { answerFreeAttack, everyFoeAnswered, foesLeftBehind, type LeaveMeleeState, releaseMover } from './leave-melee.ts';

const G = 100;
const at = (id: string, col: number, row: number, disposition: number): EngagementToken => ({ id, x: col * G, y: row * G, width: 1, height: 1, disposition });

describe('foesLeftBehind (#770)', () => {
    const pc = at('pc', 2, 2, 1);
    const orkWest = at('w', 1, 2, -1);
    const orkEast = at('e', 3, 2, -1);
    const tokens = [pc, orkWest, orkEast, at('ally', 2, 1, 1)];

    it('moving away from both foes leaves both behind', () => {
        expect(foesLeftBehind(pc, { x: 2 * G, y: 6 * G }, tokens, G).map((t) => t.id)).toEqual(['w', 'e']);
    });
    it('stepping along one foe keeps it engaged and leaves only the other', () => {
        expect(foesLeftBehind(pc, { x: 1 * G, y: 3 * G }, tokens, G).map((t) => t.id)).toEqual(['e']);
    });
    it('a character engaged with no one leaves no one behind', () => {
        const loner = at('l', 8, 8, 1);
        expect(foesLeftBehind(loner, { x: 0, y: 0 }, [loner, ...tokens], G)).toEqual([]);
    });
});

describe('the paused move', () => {
    const state: LeaveMeleeState = {
        sceneId: 's',
        moverTokenId: 'pc',
        moverUserId: 'u',
        to: { x: 0, y: 0 },
        foes: [
            { tokenId: 'w', name: 'Ork West', outcome: 'pending' },
            { tokenId: 'e', name: 'Ork East', outcome: 'pending' },
        ],
        completed: false,
    };

    it('completes only once every foe has answered', () => {
        const one = answerFreeAttack(state, 'w', 'attacked');
        expect(everyFoeAnswered(one)).toBe(false);
        expect(everyFoeAnswered(answerFreeAttack(one, 'e', 'declined'))).toBe(true);
    });
    it('a foe keeps its first answer', () => {
        const attacked = answerFreeAttack(state, 'w', 'attacked');
        expect(answerFreeAttack(attacked, 'w', 'declined').foes[0]?.outcome).toBe('attacked');
    });
    it('the GM releasing the mover declines everyone still pending', () => {
        const released = releaseMover(answerFreeAttack(state, 'w', 'attacked'));
        expect(released.foes.map((f) => f.outcome)).toEqual(['attacked', 'declined']);
        expect(everyFoeAnswered(released)).toBe(true);
    });
});
