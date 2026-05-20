/**
 * Unit coverage for the Black Crusade advancement matrix (#173).
 *
 * Each assertion is keyed to a RAW page reference so a future content
 * audit can re-verify the table values without re-reading the engine.
 *
 * RAW sources (`.pdf/bc/core/core.md`):
 *   - Table 2-4 (Allies and Opponents, :2594)
 *   - Table 2-6 (Characteristic Advancement Costs, :2657)
 *   - Table 2-7 (Skill Advance Costs, :2700)
 *   - Table 2-9 (Talent Advance Costs, :2776)
 *   - Infamy advance: :2667 (500 xp / +5, capped at 40)
 *   - Khorne / psyker lock: :2750
 */
import { describe, expect, it } from 'vitest';
import {
    BC_ALIGNMENT_CHECK_CP_INTERVAL,
    BC_ALIGNMENT_SWITCH_THRESHOLD,
    BC_CHARACTERISTIC_TIERS,
    BC_INFAMY_ADVANCE_CAP,
    BC_INFAMY_ADVANCE_COST,
    BC_INFAMY_INCREMENT,
    BC_SKILL_RANK_KEYS,
    alignmentBlocksPsyker,
    characteristicAdvanceCost,
    characteristicAffiliation,
    infamyAdvanceCost,
    patronStatusFor,
    skillAdvanceCost,
    talentAdvanceCost,
} from './bc-advancement-config.ts';

describe('BC patron status (Table 2-4, core.md :2594)', () => {
    it('treats matching alignment as True', () => {
        expect(patronStatusFor('khorne', 'khorne')).toBe('true');
        expect(patronStatusFor('nurgle', 'nurgle')).toBe('true');
        expect(patronStatusFor('slaanesh', 'slaanesh')).toBe('true');
        expect(patronStatusFor('tzeentch', 'tzeentch')).toBe('true');
    });

    it('pairs Khorne/Nurgle as Allied', () => {
        expect(patronStatusFor('khorne', 'nurgle')).toBe('allied');
        expect(patronStatusFor('nurgle', 'khorne')).toBe('allied');
    });

    it('pairs Slaanesh/Tzeentch as Allied', () => {
        expect(patronStatusFor('slaanesh', 'tzeentch')).toBe('allied');
        expect(patronStatusFor('tzeentch', 'slaanesh')).toBe('allied');
    });

    it('places Khorne and Slaanesh in Opposition', () => {
        expect(patronStatusFor('khorne', 'slaanesh')).toBe('opposed');
        expect(patronStatusFor('slaanesh', 'khorne')).toBe('opposed');
    });

    it('places Nurgle and Tzeentch in Opposition', () => {
        expect(patronStatusFor('nurgle', 'tzeentch')).toBe('opposed');
        expect(patronStatusFor('tzeentch', 'nurgle')).toBe('opposed');
    });

    it('treats unaligned advances as Allied for every alignment', () => {
        expect(patronStatusFor('khorne', 'unaligned')).toBe('allied');
        expect(patronStatusFor('nurgle', 'unaligned')).toBe('allied');
        expect(patronStatusFor('slaanesh', 'unaligned')).toBe('allied');
        expect(patronStatusFor('tzeentch', 'unaligned')).toBe('allied');
    });

    it('treats unaligned character as paying Allied costs across the board', () => {
        expect(patronStatusFor('unaligned', 'khorne')).toBe('allied');
        expect(patronStatusFor('unaligned', 'nurgle')).toBe('allied');
        expect(patronStatusFor('unaligned', 'slaanesh')).toBe('allied');
        expect(patronStatusFor('unaligned', 'tzeentch')).toBe('allied');
        expect(patronStatusFor('unaligned', 'unaligned')).toBe('allied');
    });
});

describe('BC characteristic advance cost (Table 2-6, core.md :2657)', () => {
    it('matches True costs row [100, 250, 500, 750]', () => {
        // Strength (Khorne-affiliated) for a Khorne-Aligned character.
        expect(characteristicAdvanceCost('khorne', 'khorne', 0)).toBe(100);
        expect(characteristicAdvanceCost('khorne', 'khorne', 1)).toBe(250);
        expect(characteristicAdvanceCost('khorne', 'khorne', 2)).toBe(500);
        expect(characteristicAdvanceCost('khorne', 'khorne', 3)).toBe(750);
    });

    it('matches Allied costs row [250, 500, 750, 1000]', () => {
        // Strength (Khorne) for a Nurgle-Aligned character (Khorne/Nurgle = Allied).
        expect(characteristicAdvanceCost('nurgle', 'khorne', 0)).toBe(250);
        expect(characteristicAdvanceCost('nurgle', 'khorne', 1)).toBe(500);
        expect(characteristicAdvanceCost('nurgle', 'khorne', 2)).toBe(750);
        expect(characteristicAdvanceCost('nurgle', 'khorne', 3)).toBe(1000);
    });

    it('matches Opposed costs row [500, 750, 1000, 2500]', () => {
        // Fellowship (Slaanesh) for a Khorne-Aligned character (Slaanesh = Opposed).
        expect(characteristicAdvanceCost('khorne', 'slaanesh', 0)).toBe(500);
        expect(characteristicAdvanceCost('khorne', 'slaanesh', 1)).toBe(750);
        expect(characteristicAdvanceCost('khorne', 'slaanesh', 2)).toBe(1000);
        expect(characteristicAdvanceCost('khorne', 'slaanesh', 3)).toBe(2500);
    });

    it('returns null past the Expert tier', () => {
        expect(characteristicAdvanceCost('khorne', 'khorne', 4)).toBeNull();
        expect(characteristicAdvanceCost('khorne', 'khorne', BC_CHARACTERISTIC_TIERS.length)).toBeNull();
    });

    it('returns null for invalid tier indices', () => {
        expect(characteristicAdvanceCost('khorne', 'khorne', -1)).toBeNull();
    });
});

describe('BC skill advance cost (Table 2-7, core.md :2700)', () => {
    it('matches True costs row [100, 200, 400, 600]', () => {
        // Athletics (Khorne) for a Khorne-Aligned character.
        expect(skillAdvanceCost('khorne', 'khorne', 0)).toBe(100);
        expect(skillAdvanceCost('khorne', 'khorne', 1)).toBe(200);
        expect(skillAdvanceCost('khorne', 'khorne', 2)).toBe(400);
        expect(skillAdvanceCost('khorne', 'khorne', 3)).toBe(600);
    });

    it('matches Allied costs row [200, 350, 500, 750]', () => {
        // Athletics (Khorne) for a Nurgle-Aligned character.
        expect(skillAdvanceCost('nurgle', 'khorne', 0)).toBe(200);
        expect(skillAdvanceCost('nurgle', 'khorne', 1)).toBe(350);
        expect(skillAdvanceCost('nurgle', 'khorne', 2)).toBe(500);
        expect(skillAdvanceCost('nurgle', 'khorne', 3)).toBe(750);
    });

    it('matches Opposed costs row [250, 500, 750, 1000]', () => {
        // Charm (Slaanesh) for a Khorne-Aligned character — matches the
        // RAW worked example at core.md :2688 ("further 500 xp").
        expect(skillAdvanceCost('khorne', 'slaanesh', 0)).toBe(250);
        expect(skillAdvanceCost('khorne', 'slaanesh', 1)).toBe(500);
        expect(skillAdvanceCost('khorne', 'slaanesh', 2)).toBe(750);
        expect(skillAdvanceCost('khorne', 'slaanesh', 3)).toBe(1000);
    });

    it('returns null past the Veteran rank', () => {
        expect(skillAdvanceCost('khorne', 'khorne', BC_SKILL_RANK_KEYS.length)).toBeNull();
        expect(skillAdvanceCost('khorne', 'khorne', 4)).toBeNull();
    });
});

describe('BC talent advance cost (Table 2-9, core.md :2776)', () => {
    it('matches True costs row [200, 300, 400]', () => {
        // Khorne-affiliated talent for a Khorne-Aligned character.
        expect(talentAdvanceCost('khorne', 'khorne', 1)).toBe(200);
        expect(talentAdvanceCost('khorne', 'khorne', 2)).toBe(300);
        expect(talentAdvanceCost('khorne', 'khorne', 3)).toBe(400);
    });

    it('matches Allied costs row [250, 500, 750]', () => {
        expect(talentAdvanceCost('nurgle', 'khorne', 1)).toBe(250);
        expect(talentAdvanceCost('nurgle', 'khorne', 2)).toBe(500);
        expect(talentAdvanceCost('nurgle', 'khorne', 3)).toBe(750);
    });

    it('matches Opposed costs row [500, 750, 1000]', () => {
        expect(talentAdvanceCost('khorne', 'slaanesh', 1)).toBe(500);
        expect(talentAdvanceCost('khorne', 'slaanesh', 2)).toBe(750);
        expect(talentAdvanceCost('khorne', 'slaanesh', 3)).toBe(1000);
    });

    it('returns null for tiers outside 1..3', () => {
        expect(talentAdvanceCost('khorne', 'khorne', 0)).toBeNull();
        expect(talentAdvanceCost('khorne', 'khorne', 4)).toBeNull();
    });
});

describe('BC characteristic affiliation (Table 2-5, core.md :2601, :2586)', () => {
    it('pairs the four named characteristics with their gods', () => {
        expect(characteristicAffiliation('strength')).toBe('khorne');
        expect(characteristicAffiliation('toughness')).toBe('nurgle');
        expect(characteristicAffiliation('fellowship')).toBe('slaanesh');
        expect(characteristicAffiliation('willpower')).toBe('tzeentch');
    });

    it('treats the other six characteristics (incl. Infamy) as unaligned', () => {
        expect(characteristicAffiliation('weaponSkill')).toBe('unaligned');
        expect(characteristicAffiliation('ballisticSkill')).toBe('unaligned');
        expect(characteristicAffiliation('agility')).toBe('unaligned');
        expect(characteristicAffiliation('intelligence')).toBe('unaligned');
        expect(characteristicAffiliation('perception')).toBe('unaligned');
        expect(characteristicAffiliation('infamy')).toBe('unaligned');
    });

    it('returns unaligned for unknown keys (defensive)', () => {
        expect(characteristicAffiliation('madeUp')).toBe('unaligned');
    });
});

describe('BC Infamy advance (core.md :2667)', () => {
    it('exposes a flat 500 xp / +5 advance', () => {
        expect(BC_INFAMY_ADVANCE_COST).toBe(500);
        expect(BC_INFAMY_INCREMENT).toBe(5);
        expect(BC_INFAMY_ADVANCE_CAP).toBe(40);
    });

    it('returns the flat cost while Infamy is below the cap', () => {
        expect(infamyAdvanceCost(0)).toBe(500);
        expect(infamyAdvanceCost(35)).toBe(500);
        expect(infamyAdvanceCost(39)).toBe(500);
    });

    it('blocks the purchase once Infamy reaches or exceeds the cap', () => {
        expect(infamyAdvanceCost(40)).toBeNull();
        expect(infamyAdvanceCost(45)).toBeNull();
        expect(infamyAdvanceCost(100)).toBeNull();
    });
});

describe('Khorne / psyker lock (core.md :2750)', () => {
    it('blocks psyker status only when Aligned to Khorne', () => {
        expect(alignmentBlocksPsyker('khorne')).toBe(true);
        expect(alignmentBlocksPsyker('nurgle')).toBe(false);
        expect(alignmentBlocksPsyker('slaanesh')).toBe(false);
        expect(alignmentBlocksPsyker('tzeentch')).toBe(false);
        expect(alignmentBlocksPsyker('unaligned')).toBe(false);
    });
});

describe('BC alignment constants (core.md :2559, :2569)', () => {
    it('exposes a 5-advance switch threshold', () => {
        expect(BC_ALIGNMENT_SWITCH_THRESHOLD).toBe(5);
    });

    it('exposes a 10-CP re-check interval', () => {
        expect(BC_ALIGNMENT_CHECK_CP_INTERVAL).toBe(10);
    });
});
