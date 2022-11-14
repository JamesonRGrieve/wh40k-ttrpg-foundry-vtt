export function homeworlds() {
    return [
        {
            name: 'Feral World',
            bonus_characteristics: ['Strength', 'Toughness'],
            negative_characteristic: 'Influence',
            fate_threshold: 2,
            emperors_blessing: 3,
            home_world_bonus: {
                name: 'The Old Ways',
                benefit: "A Feral World character's Low-Tech weapons lose any present Primitive Qualities and gain the Proven (3) Quality.",
            },
            aptitude: 'Toughness',
            wounds: '9+1d5',
            source: 'PG 32 CB',
        },
        {
            name: 'Forge World',
            bonus_characteristics: ['Intelligence', 'Toughness'],
            negative_characteristic: 'Fellowship',
            fate_threshold: 3,
            emperors_blessing: 8,
            home_world_bonus: {
                name: "Omnissiah's Chosen",
                benefit: 'A Forge World character gains the Technical Knock or Weapon-Tech Talent.',
            },
            aptitude: 'Intelligence',
            wounds: '8+1d5',
            source: 'PG 34 CB',
        },
        {
            name: 'Highborn',
            bonus_characteristics: ['Fellowship', 'Influence'],
            negative_characteristic: 'Toughness',
            fate_threshold: 4,
            emperors_blessing: 10,
            home_world_bonus: {
                name: 'Breeding Counts',
                benefit: 'A Highborn character reduces Influence losses by 1, to a minimum loss of 1.',
            },
            aptitude: 'Fellowship',
            wounds: '9+1d5',
            source: 'PG 36 CB',
        },
        {
            name: 'Hive World',
            bonus_characteristics: ['Agility', 'Perception'],
            negative_characteristic: 'Willpower',
            fate_threshold: 2,
            emperors_blessing: 6,
            home_world_bonus: {
                name: 'Teeming Masses in Metal Mountains',
                benefit:
                    'A Hive World character moves through crowds as if they were open terrain and gains a +20 bonus to Navigate (Surface) Tests in closed spaces.',
            },
            aptitude: 'Perception',
            wounds: '7+1d5',
            source: 'PG 38 CB',
        },
        {
            name: 'Shrine World',
            bonus_characteristics: ['Fellowship', 'Willpower'],
            negative_characteristic: 'Perception',
            fate_threshold: 3,
            emperors_blessing: 6,
            home_world_bonus: {
                name: 'Faith in the Creed',
                benefit: "When spending a Fate Point, a Shrine World character's number of Fate Points are not reduced on a 1d10 result of 1.",
            },
            aptitude: 'Willpower',
            wounds: '8+1d5',
            source: 'PG 40 CB',
        },
        {
            name: 'Garden World',
            bonus_characteristics: ['Fellowship', 'Agility'],
            negative_characteristic: 'Toughness',
            fate_threshold: 2,
            emperors_blessing: 4,
            home_world_bonus: {
                name: 'Serenity of the Green',
                benefit:
                    'A garden world character halves the duration (rounded up) of any result from Table 8-11: Shock or Table 8-13: Mental Traumas, and can remove Insanity points for 50xp per point.',
            },
            aptitude: 'Social',
            wounds: '7+1d5',
            source: 'PG 28 EO',
        },
        {
            name: 'Research Station',
            bonus_characteristics: ['Intelligence', 'Perception'],
            negative_characteristic: 'Fellowship',
            fate_threshold: 3,
            emperors_blessing: 8,
            home_world_bonus: {
                name: 'Pursuit of Data',
                benefit:
                    'Whenever character reaches Rank 2 (Trained) in a Scholastic Lore skill, he also gains Rank 1 (Known) in one related or identical Forbidden Lore skill specialization of his choice. The GM is the final arbiter of whether the two specializations are related.',
            },
            aptitude: 'Knowledge',
            wounds: '8+1d5',
            source: 'PG 30 EO',
        },
        {
            name: 'Voidborn',
            bonus_characteristics: ['Intelligence', 'Willpower'],
            negative_characteristic: 'Strength',
            fate_threshold: 3,
            emperors_blessing: 5,
            home_world_bonus: {
                name: 'Child of the Dark',
                benefit: 'A Voidborn character gains a the Strong Minded Talent and a +30 bonus to movement tests in zero gravity.',
            },
            aptitude: 'Intelligence',
            wounds: '7+1d5',
            source: 'PG 42 CB',
        },
        {
            name: 'Agri-World',
            bonus_characteristics: ['Fellowship', 'Strength'],
            negative_characteristic: 'Agility',
            fate_threshold: 2,
            emperors_blessing: 7,
            home_world_bonus: {
                name: 'Strength from the Land',
                benefit: 'An agri-world Character starts with the Brutal Charge (2) trait.',
            },
            aptitude: 'Strength',
            wounds: '8+1d5',
            source: 'PG 24 EI',
        },
        {
            name: 'Feudal World',
            bonus_characteristics: ['Perception', 'Weapon Skill'],
            negative_characteristic: 'Intelligence',
            fate_threshold: 3,
            emperors_blessing: 6,
            home_world_bonus: {
                name: 'At Home in Armor',
                benefit: 'A feudal world character ignores the maximum Agility value imposed by any armor he is wearing.',
            },
            aptitude: 'Weapon Skill',
            wounds: '9+1d5',
            source: 'PG 26 EI',
        },
        {
            name: 'Frontier World',
            bonus_characteristics: ['Ballistic Skill', 'Perception'],
            negative_characteristic: 'Fellowship',
            fate_threshold: 3,
            emperors_blessing: 7,
            home_world_bonus: {
                name: 'Rely on None but Yourself',
                benefit:
                    'A frontier world character gains a +20 bonus to Tech-use test when applying personal weapon modifications, and a +10 bonus when repairing damaged items.',
            },
            aptitude: 'Ballistic Skill',
            wounds: '7+1d5',
            source: 'PG 28 EI',
        },
        {
            name: 'Death World',
            bonus_characteristics: ['Agility', 'Perception'],
            negative_characteristic: 'Fellowship',
            fate_threshold: 2,
            emperors_blessing: 5,
            home_world_bonus: {
                name: 'Survivor Paranoia',
                benefit:
                    'While a death world character is surprised, non-surprised attackers do not gain the normal +30 bonus to their Weapon Skill and Ballistic Skill tests when targeting this character.',
            },
            aptitude: 'Fieldcraft',
            wounds: '9+1d5',
            source: 'PG 26 EO',
        },
        {
            name: 'Daemon World',
            bonus_characteristics: ['Willpower', 'Perception'],
            negative_characteristic: 'Fellowship',
            fate_threshold: 3,
            emperors_blessing: 4,
            home_world_bonus: {
                name: 'Touched by the Warp',
                benefit:
                    'Begins with one Rank in the Psyniscience skill. Should he gain this skill again in a later step of character creation, he instead gains one additional Rank in the skill. Note that he cannot purchase more Ranks of this skill unless he acquires the Psyker aptitude. This character also begins with 1d10+5 Corruption points.',
            },
            aptitude: 'Willpower',
            wounds: '7+1d5',
            source: 'PG 26 EB',
        },
        {
            name: 'Penal Colony',
            bonus_characteristics: ['Toughness', 'Perception'],
            negative_characteristic: 'Influence',
            fate_threshold: 3,
            emperors_blessing: 8,
            home_world_bonus: {
                name: 'Finger on the Pulse',
                benefit:
                    'One survives a penal colony by instinctively knowing who is in charge and who is a threat. A penal colony character begins with one Rank in the Common Lore (Underworld) and Scrutiny skills,and starts with the Peer (Criminal Cartels) talent.',
            },
            aptitude: 'Toughness',
            wounds: '10+1d5',
            source: 'PG 28 EB',
        },
        {
            name: 'Quarantine World',
            bonus_characteristics: ['Ballistic Skill', 'Intelligence'],
            negative_characteristic: 'Strength',
            fate_threshold: 3,
            emperors_blessing: 9,
            home_world_bonus: {
                name: 'Secretive by Nature',
                benefit:
                    'Those who manage to leave a quarantine world learn how to keep secrets. Whenever the warband’s Subtlety would decrease, it decreases by 2 less (to a minimum reduction of 1).',
            },
            aptitude: 'Fieldcraft',
            wounds: '8+1d5',
            source: 'PG 30 EB',
        },
    ];
}

export function homeworldNames() {
    return homeworlds().map((h) => h.name);
}
