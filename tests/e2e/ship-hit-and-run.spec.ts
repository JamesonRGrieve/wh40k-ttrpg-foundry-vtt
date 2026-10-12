import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { countDamageSections, deleteChatMessage, postShipAssaultCard } from './lib/ship-assault';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Rogue Trader Hit-and-Run chat card (GitHub
 * #188 — RT Core p.218). Drives the real Hit and Run flow with fixed dice:
 * the Challenging (+0) approach (−10 per target Turret Rating point), the
 * opposed Ordinary (+10) Command Tests, both 1d5 Critical Hit rolls with the
 * raider's pick, and 1 Hull Integrity per degree won by. Renders
 * `ship-hit-and-run-chat.hbs`, posts it via `ChatMessage.create`, and asserts
 * the critical-success outcome reaches the DOM with per-system anchor.
 *
 * Card left open through `snap()` to capture the live DOM.
 */
test.describe.serial('Ship Hit-and-Run chat card (Tier B)', () => {
    test('posts the hit-and-run critical-success card and snaps', async ({ page }) => {
        await joinOrSkip(page);

        // Approach: Pilot 50 + 0 − 20 (Turret Rating 2) = 30, rolls 10.
        // Command: raider 50 + 10 = 60 rolls 15 → 5 DoS; defender 40 + 10 = 50 rolls 45 → 1 DoS.
        // The raid wins by 4; the Critical Hit rolls are 2 and 5 and the raider picks the 5.
        const result = await postShipAssaultCard(page, {
            flowModule: 'hit-and-run-flow',
            flowExport: 'HIT_AND_RUN_FLOW',
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
                    name: 'Chaos Raider Bone Tithe',
                    hullType: 'raider',
                    manoeuvrability: 20,
                    armour: 16,
                    turretRating: 2,
                    crewPopulation: 55,
                    hullIntegrity: 28,
                    morale: 60,
                },
                crewRating: 40,
            },
            rolls: [{ total: 10 }, { total: 15 }, { total: 45 }, { total: 2 }, { total: 5 }],
            form: { critPick: '1' },
            labels: {
                critPicks: { key: 'WH40K.Voidcraft.HitAndRun.CritPicks', data: { first: 2, second: 5 } },
                critChosen: { key: 'WH40K.Voidcraft.HitAndRun.CritChosen', data: { roll: 5 } },
                hull: { key: 'WH40K.Voidcraft.HitAndRun.HullDamage' },
            },
        });

        await snap(page, 'ship-hit-and-run-chat');
        await deleteChatMessage(page, result.messageId);

        expect(result.error, `ship-hit-and-run flow error: ${result.error ?? ''}`).toBeNull();
        expect(result.html.length, 'ship-hit-and-run card did not render').toBeGreaterThan(0);
        expect(result.html, 'card root [data-wh40k-hook="ship-har-card"] missing').toContain('data-wh40k-hook="ship-har-card"');
        expect(result.html, 'per-system data-wh40k-system anchor missing').toContain('data-wh40k-system="rt"');
        expect(result.html, 'both Critical Hit rolls should render on a critical success').toContain(result.labels['critPicks']);
        expect(result.html, 'the chosen Critical Hit should render on a critical success').toContain(result.labels['critChosen']);
        expect(result.html, 'HullDamage row should render on a critical success').toContain(result.labels['hull']);
        expect(countDamageSections(result.html), 'one Hull damage section').toBe(1);
        expect(result.unusedRolls, 'the flow should consume every queued die').toBe(0);
        // 1 Hull per degree won by, and the raider's chosen Critical Hit roll.
        expect(result.defender.hull).toEqual([4]);
        expect(result.defender.criticals).toEqual([5]);
        expect(result.messageId, 'ChatMessage.create returned no id').not.toBeNull();

        recordCoverage('chat.render', 'ShipHitAndRun');
    });
});
