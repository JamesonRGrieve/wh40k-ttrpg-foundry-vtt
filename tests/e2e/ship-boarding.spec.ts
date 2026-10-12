import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { countDamageSections, deleteChatMessage, postShipAssaultCard } from './lib/ship-assault';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Boarding Action chat card (GitHub
 * #188 — RT Core p.215). Drives the real boarding-round flow with fixed dice:
 * the opposed Command Test (Crew and Turret bonuses on the attacker), the
 * winner spending its degrees on Hull and on 1d5 Crew + 1d5 Morale, and the
 * loser's Morale check. Renders `ship-boarding-chat.hbs`, posts it via
 * `ChatMessage.create`, and asserts the damage sections + per-system anchor.
 *
 * Card is left open through `snap()` to capture the live DOM, then
 * removed in a cleanup pass to avoid leaking into other serial tests.
 */
test.describe.serial('Ship Boarding chat card (Tier B)', () => {
    test('posts the boarding breach card and snaps', async ({ page }) => {
        await joinOrSkip(page);

        // Attacker Command 50 +20 Crew (80 vs 55) +10 Turrets = 80, rolls 50 → 4 DoS.
        // Defender Command 45 +10 Turrets = 55, rolls 60 → fails. The attacker wins by 4
        // and spends 1 degree on Hull, 3 on 1d5 Crew + 1d5 Morale.
        const result = await postShipAssaultCard(page, {
            flowModule: 'boarding-flow',
            flowExport: 'BOARDING_ROUND_FLOW',
            attacker: {
                profile: {
                    name: 'The Errant Vector',
                    hullType: 'frigate',
                    manoeuvrability: 15,
                    armour: 18,
                    turretRating: 1,
                    crewPopulation: 80,
                    hullIntegrity: 35,
                    morale: 75,
                },
                crewRating: 50,
            },
            defender: {
                profile: {
                    name: 'Eldar Corsair',
                    hullType: 'raider',
                    manoeuvrability: 20,
                    armour: 16,
                    turretRating: 1,
                    crewPopulation: 55,
                    hullIntegrity: 28,
                    morale: 60,
                },
                crewRating: 45,
            },
            rolls: [{ total: 50 }, { total: 60 }, { total: 9, dice: [2, 3, 4] }, { total: 6, dice: [1, 2, 3] }, { total: 40 }],
            form: { attackerCommand: 50, defenderCommand: 45, hullDegrees: 1 },
            labels: {
                hull: { key: 'WH40K.Voidcraft.Boarding.HullDamage' },
                winner: { key: 'WH40K.Voidcraft.Boarding.Winner', data: { winner: 'The Errant Vector', degrees: 4 } },
            },
        });

        await snap(page, 'ship-boarding-chat');
        await deleteChatMessage(page, result.messageId);

        expect(result.error, `ship-boarding flow error: ${result.error ?? ''}`).toBeNull();
        expect(result.html.length, 'ship-boarding card did not render').toBeGreaterThan(0);
        expect(result.html, 'card root [data-wh40k-hook="ship-boarding-card"] missing').toContain('data-wh40k-hook="ship-boarding-card"');
        expect(result.html, 'per-system data-wh40k-system anchor missing').toContain('data-wh40k-system="rt"');
        expect(result.html, 'the round winner and its degrees should render').toContain(result.labels['winner']);
        expect(result.html, 'damage block should render on a breach').toContain(result.labels['hull']);
        expect(countDamageSections(result.html), 'Hull, Crew and Morale damage sections').toBe(3);
        expect(result.unusedRolls, 'the flow should consume every queued die').toBe(0);
        // The loser takes 1 Hull per degree spent on charges, and the summed d5s.
        expect(result.defender.hull).toEqual([1]);
        expect(result.defender.crewMorale).toEqual([[9, 6]]);
        expect(result.attacker.hull).toEqual([]);
        expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();

        recordCoverage('chat.render', 'ShipBoarding');
    });
});
