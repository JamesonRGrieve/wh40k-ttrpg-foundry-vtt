import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { countDamageSections, deleteChatMessage, postShipAssaultCard } from './lib/ship-assault';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Ramming chat card (GitHub #188 —
 * RT Core p.215). Drives the real ramming flow with fixed dice: the Hard
 * (−20) Pilot + Manoeuvrability test, then the rammed ship's hull-size die
 * (read from the Ramming Speed order in the RT compendium) + the rammer's prow
 * armour, and the rammer's rebound of the defender's Armour + 1d5. Renders
 * `ship-ramming-chat.hbs`, posts it via `ChatMessage.create`, and asserts the
 * card root + per-system `data-wh40k-system` anchor + both damage sections.
 *
 * The posted message is left in the chat log through `snap()` so the
 * screenshot captures the live card — mirrors the open-through-snap
 * discipline of `disorder-roll-dialog.spec.ts`.
 */
test.describe.serial('Ship Ramming chat card (Tier B)', () => {
    test('posts the ramming hit card and snaps', async ({ page }) => {
        await joinOrSkip(page);

        // Pilot 45 + Manoeuvrability 15 − 20 = 40; a roll of 20 rams.
        const result = await postShipAssaultCard(page, {
            flowModule: 'ramming-flow',
            flowExport: 'RAMMING_FLOW',
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
                crewRating: 45,
            },
            defender: {
                profile: {
                    name: 'Ork Kroozer Grimskull',
                    hullType: 'cruiser',
                    manoeuvrability: 5,
                    armour: 16,
                    turretRating: 2,
                    crewPopulation: 90,
                    hullIntegrity: 70,
                    morale: 80,
                },
                crewRating: 40,
            },
            rolls: [{ total: 20 }, { total: 7 }, { total: 3 }],
            form: {},
            labels: {
                defenderHull: { key: 'WH40K.Voidcraft.Ramming.DefenderHull', data: { ship: 'Ork Kroozer Grimskull' } },
                attackerHull: { key: 'WH40K.Voidcraft.Ramming.AttackerHull', data: { ship: 'The Errant Vector' } },
            },
        });

        await snap(page, 'ship-ramming-chat');
        await deleteChatMessage(page, result.messageId);

        expect(result.error, `ship-ramming flow error: ${result.error ?? ''}`).toBeNull();
        expect(result.html.length, 'ship-ramming card did not render').toBeGreaterThan(0);
        expect(result.html, 'card root [data-wh40k-hook="ship-ramming-card"] missing').toContain('data-wh40k-hook="ship-ramming-card"');
        expect(result.html, 'per-system data-wh40k-system anchor missing').toContain('data-wh40k-system="rt"');
        expect(result.html, 'damage block should render on a hit').toContain(result.labels['defenderHull']);
        expect(result.html, 'the rammer rebound damage should render on a hit').toContain(result.labels['attackerHull']);
        expect(countDamageSections(result.html), 'one damage section per ship').toBe(2);
        // A frigate rams with 1d10 (the Ramming Speed order's hull-size table); the rebound is 1d5.
        expect(result.formulas).toEqual(['1d100', '1d10', '1d5']);
        expect(result.unusedRolls, 'the flow should consume every queued die').toBe(0);
        // Rammed ship: 7 + 18 prow armour. Rammer: 16 Armour + 3. Neither is reduced by armour or shields.
        expect(result.defender.hull).toEqual([25]);
        expect(result.attacker.hull).toEqual([19]);
        expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();

        recordCoverage('chat.render', 'ShipRamming');
    });
});
