export function roles() {
    return [
        {
            name: 'Assassin',
            role_aptitudes: ['Agility', 'Ballistic Skill or Weapon Skill', 'Fieldcraft', 'Finesse', 'Perception'],
            role_talents: ['Jaded', 'Leap Up'],
            role_bonus: {
                name: 'Sure Kill',
                benefit:
                    'In addition to the normal uses of Fate points(pg 293), when an Assassin successfully hits with an attack, he may spend a Fate point to inflict additional damage equal to his degrees of success on the attack roll on the first hit the attack inflicts.',
            },
            source: 'PG 62 CB',
        },
        {
            name: 'Chirurgeon',
            role_aptitudes: ['Fieldcraft', 'Intelligence', 'Knowledge', 'Strength', 'Toughness'],
            role_talents: ['Resistance (Pick One)', 'Takedown'],
            role_bonus: {
                name: 'Dedicated Healer',
                benefit:
                    'In addition to the normal uses of Fate points (pg 293), when a Chirurgeon character fails a test to provide First Aid, he can spend a Fate point to automatically succeed instead with the degrees of success equal to his Intelligence bonus.',
            },
            source: 'PG 64 CB',
        },
        {
            name: 'Desperado',
            role_aptitudes: ['Agility', 'Ballistic Skill', 'Defense', 'Fellowship', 'Finesse'],
            role_talents: ['Catfall', 'Quick Draw'],
            role_bonus: {
                name: 'Move and Shoot',
                benefit:
                    'Once per round, after performing Move action, a Desperado character may perform a single Standard Attack with a Pistol weapon he is currently wielding as a Free Action.',
            },
            source: 'PG 66 CB',
        },
        {
            name: 'Hierophant',
            role_aptitudes: ['Fellowship', 'Offence', 'Social', 'Toughness', 'Willpower'],
            role_talents: ['Double Team', 'Hatred (Pick One)'],
            role_bonus: {
                name: 'Sway the Masses',
                benefit:
                    'In addition to the normal uses of Fate points (pg 293), a Hierophant character may spend a Fate point to automatically succeed at a Charm, Command, or Intimidate skill test with a number of degrees of success equal to his Willpower bonus.',
            },
            source: 'PG 68 CB',
        },
        {
            name: 'Mystic',
            role_aptitudes: ['Defense', 'Intelligence', 'Knowledge', 'Perception', 'Willpower'],
            role_talents: ['Resistance (Psychic Powers)', 'Warp Sense'],
            role_bonus: {
                name: 'Stare into the Warp',
                benefit:
                    'A Mystic character starts the game with the Psyker elite advance (pg 90). It is recommended that a character who wishes to be a Mystic have a Willpower of at least 35.',
            },
            source: 'PG 70 CB',
        },
        {
            name: 'Sage',
            role_aptitudes: ['Intelligence', 'Knowledge', 'Perception', 'Tech', 'Willpower'],
            role_talents: ['Ambidextrous', 'Clues from the Crowds'],
            role_bonus: {
                name: 'Quest for Knowledge',
                benefit:
                    'In addition to the normal uses of Fate points (pg 293), a Sage character may spend a Fate point to automatically succeed at a Logic or any Lore skill test with a number of degrees of success equal to his Intelligence bonus.',
            },
            source: 'PG 72 CB',
        },
        {
            name: 'Seeker',
            role_aptitudes: ['Fellowship', 'Intelligence', 'Perception', 'Social', 'Tech'],
            role_talents: ['Keen Intuition', 'Disarm'],
            role_bonus: {
                name: 'Nothing Escapes My Sight',
                benefit:
                    'In addition to the normal uses of Fate points (pg 293), a Seeker character may spend a Fate point to automatically succeed at an Awareness or Inquiry skill test with a number of degrees of success equal to his Perception bonus.',
            },
            source: 'PG 74 CB',
        },
        {
            name: 'Warrior',
            role_aptitudes: ['Ballistic Skill', 'Defense', 'Offence', 'Strength', 'Weapon Skill'],
            role_talents: ['Iron Jaw', 'Rapid Reload'],
            role_bonus: {
                name: 'Expert at Violence',
                benefit:
                    'In addition to the normal uses of Fate points (pg 293), after making a successful attack test, but before determining hits, a Warrior character may spend a Fate point to substitute his Weapon Skill (for melee) or Ballistic Skill (for ranged) bonus for the degrees of success scored on the attack test.',
            },
            source: 'PG 76 CB',
        },
        {
            name: 'Fanatic',
            role_aptitudes: ['Leadership', 'Offence', 'Toughness', 'Weapon Skill', 'Willpower'],
            role_talents: ['Deny the Witch', 'Jaded'],
            role_bonus: {
                name: 'Death to All Who Oppose Me!',
                benefit:
                    'In addition to the normal uses of Fate points, a Fanatic character may spend a Fate point to count as having the Hatred talent against his current foe for the duration of the encounter. Should he choose to leave combat against a Hated foe in that encounter, however, he gains 1 Insanity point.',
            },
            source: 'PG 34 EI',
        },
        {
            name: 'Penitent',
            role_aptitudes: ['Agility', 'Fieldcraft', 'Intelligence', 'Offence', 'Toughness'],
            role_talents: ['Die Hard', 'Flagellant'],
            role_bonus: {
                name: 'Cleansing Pain',
                benefit:
                    'Whenever a Penitent character suffers 1 or more points of damage (after reductions for Toughness bonus and Armour), he gains a +10 bonus to the first test he makes before the end of his next turn.',
            },
            source: 'PG 36 EI',
        },
        {
            name: 'Ace',
            role_aptitudes: ['Agility', 'Finesse', 'Perception', 'Tech', 'Willpower'],
            role_talents: ['Hard Target', 'Hotshot Pilot'],
            role_bonus: {
                name: 'Right Stuff',
                benefit:
                    'In addition to the normal uses of Fate points , an Ace character may spend a Fate point to automatically succeed at an Operate or Survival skill test involving vehicles or living steeds with a number of degrees of success equal to his Agility bonus.',
            },
            source: 'PG 38 EO',
        },
        {
            name: 'Crusader',
            role_aptitudes: ['Knowledge', 'Offence', 'Strength', 'Toughness', 'Willpower'],
            role_talents: ['Bodyguard', 'Deny the Witch'],
            role_bonus: {
                name: 'Smite the Unholy',
                benefit:
                    'In addition to the normal uses of Fate Points (see pg 293CB), a Crusader character can also spend a Fate Point to automatically pass a Fear test with a number of degrees of success equal to his Willpower bonus. In addition, whenever he inflicts a hit with a melee attack against a target with the Fear (X) trait, he inflicts X additional damage and counts his weapons penetration as being X higher.',
            },
            source: 'PG 34 EB',
        },
    ];
}

export function roleNames() {
    return roles().map((r) => r.name);
}
