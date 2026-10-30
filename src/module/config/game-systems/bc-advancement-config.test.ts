/**
 * Unit coverage for the Black Crusade advancement matrix (#173).
 *
 * Each assertion is keyed to the RAW table it checks so a future content
 * audit can re-verify the table values without re-reading the engine.
 *
 * RAW sources (the BC rules):
 *   - the Allies and Opponents table
 *   - the Characteristic Advancement Costs table
 *   - the Skill Advance Costs table
 *   - the Talent Advance Costs table
 *   - Infamy advance (500 xp / +5, capped at 40)
 *   - Khorne / psyker lock
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    chaosAlignmentLabelKey,
    isChaosAlignment,
    characteristicAdvanceCost,
    characteristicAffiliation,
    infamyAdvanceCost,
    patronStatusFor,
    skillAdvanceCost,
    talentAdvanceCost,
} from './bc-advancement-config.ts';

describe('BC patron status (Allies and Opponents)', () => {
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

describe('BC characteristic advance cost (Characteristic Advancement Costs)', () => {
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

describe('BC skill advance cost (Skill Advance Costs)', () => {
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
        // RAW worked example ("further 500 xp").
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

describe('BC talent advance cost (Talent Advance Costs)', () => {
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

describe('BC characteristic affiliation', () => {
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

describe('BC Infamy advance', () => {
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

describe('Khorne / psyker lock', () => {
    it('blocks psyker status only when Aligned to Khorne', () => {
        expect(alignmentBlocksPsyker('khorne')).toBe(true);
        expect(alignmentBlocksPsyker('nurgle')).toBe(false);
        expect(alignmentBlocksPsyker('slaanesh')).toBe(false);
        expect(alignmentBlocksPsyker('tzeentch')).toBe(false);
        expect(alignmentBlocksPsyker('unaligned')).toBe(false);
    });
});

describe('BC alignment constants', () => {
    it('exposes a 5-advance switch threshold', () => {
        expect(BC_ALIGNMENT_SWITCH_THRESHOLD).toBe(5);
    });

    it('exposes a 10-CP re-check interval', () => {
        expect(BC_ALIGNMENT_CHECK_CP_INTERVAL).toBe(10);
    });
});

describe('Chaos alignment labels (#646)', () => {
    const lang = JSON.parse(readFileSync(resolve(__dirname, '../../../lang/en.json'), 'utf8')) as {
        WH40K: { BC: { Advancement: { Alignment: Record<string, string> } } };
    };

    it.each([
        ['khorne', 'Khorne'],
        ['nurgle', 'Nurgle'],
        ['slaanesh', 'Slaanesh'],
        ['tzeentch', 'Tzeentch'],
        ['unaligned', 'Unaligned'],
    ])('the stored id %s names the %s label, which the langpack carries', (id, label) => {
        expect(chaosAlignmentLabelKey(id)).toBe(`WH40K.BC.Advancement.Alignment.${label}`);
        expect(lang.WH40K.BC.Advancement.Alignment[label]).toBe(label);
    });

    it('a value that is not an alignment id passes through unchanged', () => {
        expect(isChaosAlignment('Khorne')).toBe(false);
        expect(chaosAlignmentLabelKey('Khorne')).toBe('Khorne');
        expect(chaosAlignmentLabelKey('')).toBe('');
        expect(isChaosAlignment('toString')).toBe(false);
    });

    it('the Apotheosis panel and the ascension card name the alignment through its label, as the other BC panels do', () => {
        const template = (path: string): string => readFileSync(resolve(__dirname, '../../../templates', path), 'utf8');
        expect(template('actor/panel/bc-daemon-prince-panel.hbs')).toContain(
            'alignment=(localize (chaosAlignmentLabelKey daemonPrincePanel.alignmentAtAscension))',
        );
        expect(template('chat/bc-ascension-chat.hbs')).toContain('alignment=(localize (chaosAlignmentLabelKey alignmentAtAscension))');
        for (const path of ['actor/panel/bc-gifts-panel.hbs', 'actor/panel/bc-alignment-panel.hbs']) {
            expect(template(path)).not.toContain('"WH40K.BC.Advancement.Alignment." (capitalize');
        }
    });
});
