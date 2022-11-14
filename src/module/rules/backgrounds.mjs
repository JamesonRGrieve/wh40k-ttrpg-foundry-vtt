export function backgrounds() {
    return [
        {
            name: 'Adeptus Administratum',
            starting_skills: 'Commerce or Medicae, Common Lore (Adeptus Administratum), Linguistics (High Gothic), Logic, Scholastic Lore (Pick One)',
            starting_talents: 'Weapon Training (Las or Solid Projectile)',
            starting_equipment: 'Laspistol or Stub Automatic, Imperial robes, Autoquill, Chrono, Dataslate, Medi-kit',
            background_bonus: {
                name: 'Master of Paperwork',
                benefit:
                    'An Adeptus Administratum character counts the Availability of all items as one level more available (Very Rare items count as Rare, Average items count as Common, etc.).',
            },
            aptitudes: ['Knowledge', 'Social'],
            source: 'PG 46 CB',
        },
        {
            name: 'Adeptus Arbites',
            starting_skills: 'Awareness, Common Lore (Adeptus Arbites, Underworld), Inquiry or Interrogation, Intimidate, Scrutiny',
            starting_talents: 'Weapon Training (Shock or Solid Projectile)',
            starting_equipment: 'Shotgun or Shock Maul, Enforcer Light Carapace Armor or Carapace Chest Plate, 3 doses of Stimm, Manacles, 12 lho sticks',
            background_bonus: {
                name: 'The Face of the Law',
                benefit:
                    'An Arbitrator can intimidation and Interrogation test, and can substitute his Willpower bonus for his degrees of success on these tests.',
            },
            aptitudes: ['Offence', 'Defense'],
            source: 'PG 48 CB',
        },
        {
            name: 'Adeptus Astra Telepathica',
            starting_skills:
                'Awareness, Common Lore (Adeptus Astra Telepathica), Deceive or Interrogation, Forbidden Lore (the Warp), Psyniscience or Scrutiny',
            starting_talents: 'Weapon Training (Las, Low-Tech)',
            starting_equipment: 'Laspistol, Staff or Whip, Light Flak Cloak or Flak Vest, Micro-bead or Psy Focus',
            background_bonus: {
                name: 'The Constant Threat',
                benefit:
                    'When the character or an ally within 10 meters triggers a roll on the Psychic Phenomenon table. Adeptus Astra Telepathica character can increase or decrease the result by amount equal to his Willpower bonus.Tested on Terra: If the character takes the Psyker elite advance during character creation, he also gains the Sanctioned trait.',
            },
            aptitudes: ['Defense', 'Psyker'],
            source: 'PG 50 CB',
        },
        {
            name: 'Adeptus Mechanicus',
            starting_skills: 'Awareness or Operate (Pick One), Common Lore (Adeptus Mechanicus), Logic, Security, Tech',
            starting_talents: 'Mechadendrite Use (Utility), Weapon Training (Solid Projectile)',
            starting_equipment: 'Autogun or Hand Cannon, Monotask Servo-Skull (utility) or Optical Mechadendrite, Imperial robes, 2 vials of sacred unguents',
            background_bonus: {
                name: 'Replace the Weak Flesh',
                benefit:
                    'An Adeptus Mechanicus character counts the Availability of all cybernetics as two levels more available (Rare items count as Average, Very Rare items count as Scarce, etc.). Starting Trait: Mechanicus Implants.',
            },
            aptitudes: ['Knowledge', 'Tech'],
            source: 'PG 52 CB',
        },
        {
            name: 'Adeptus Ministorum',
            starting_skills: 'Charm, Command, Common Lore (Adeptus Ministorum), Inquiry or Scrutiny, Linguistics (High Gothic)',
            starting_talents: 'Weapon Training (Flame) or Weapon Training (Low-Tech, Solid Projectile)',
            starting_equipment: 'Hand Flamer (or Warhammer and Stub Revolver), Imperial Robes or Flak Vest, Backpack, Glow-Globe, Monotask Servo',
            background_bonus: {
                name: 'Faith is All',
                benefit: 'When spending a Fate point to gain a+10 bonus to any one test, an Adeptus Ministorum character gains a +20 bonus instead.',
            },
            aptitudes: ['Leadership', 'Social'],
            source: 'PG 54 CB',
        },
        {
            name: 'Imperial Guard',
            starting_skills: 'Athletics, Command, Common Lore (Imperial Guard), Medicae or Operate (Surface), Navigate (Surface)',
            starting_talents: 'Weapon Training (Las, Low-Tech)',
            starting_equipment: 'Lasgun (or Laspistol and Sword), Combat Vest, Imperial Guard Flak Armor, Grapnel and Line, 12 lho sticks, Magnoculars',
            background_bonus: {
                name: 'Hammer of the Emperor',
                benefit:
                    "When attacking a target that an ally attacked since the end of the Guardsman's last turn, the Guardsman can re-roll any results of 1 or 2 damage rolls.",
            },
            aptitudes: ['Fieldcraft', 'Leadership'],
            source: 'PG 56 CB',
        },
        {
            name: 'Outcast',
            starting_skills: 'Acrobatics or Sleight of Hand, Common Lore (Underworld), Deceive, Dodge, Stealth',
            starting_talents: 'Weapon Training (Chain, and Las or Solid Projectile)',
            starting_equipment: 'Autopistol or Laspistol, Chainsword, Armored Body Glove or Flak Vest, Injector, 2 doses of obscura or slaught',
            background_bonus: {
                name: 'Never Quit',
                benefit: 'An Outcast character counts his Toughness bonus as two higher for purposes of determining Fatigue.',
            },
            aptitudes: ['Fieldcraft', 'Social'],
            source: 'PG 58 CB',
        },
        {
            name: 'Adepta Sororitas',
            starting_skills: 'Athletics, Charm or Intimidate, Common Lore (Adepta Sororitas), Linguistics (High Gothic), Medicae or Parry',
            starting_talents: 'Weapon Training (Flame or Las, Chain)',
            starting_equipment: 'Hand Flamer or Laspistol, Chainblade, Armoured Bodyglove, Chrono, Dataslate, Stab Light, Micro-bead',
            background_bonus: {
                name: 'Incorruptible Devotion',
                benefit:
                    'Whenever an Adepta Sororitas Character would gain 1 or more Corruption Points, she gains that many Insanity Points minus 1 (to a minimum of 0) instead.',
            },
            aptitudes: ['Offence', 'Social'],
            source: 'PG 30 EI',
        },
        {
            name: 'Mutant',
            starting_skills: 'Acrobatics or Athletics, Awareness, Deceive or Intimidate,Forbidden Lore (Mutants), Survival',
            starting_talents:
                'Weapon Training (Low-Tech, Solid Projectile) Also one of the following: Amphibious, Dark-sight, Natural Weapons, Sonar Sense, Sturdy, Toxic (1), Unnatural Agility (1), Unnatural Strength (1), or Unnatural Toughness (1)',
            starting_equipment: 'Shotgun (or Stub Revolver and Great Weapon), Grapnel and Line, Heavy Leathers, Combat Vest, 2 doses of Stimm',
            background_bonus: {
                name: 'Twisted Flesh',
                benefit:
                    'A Mutant character can always choose to fail any test associated with resisting malignancy or mutation. Whenever he would gain a malignancy, he may roll on Table 8-16 to gain a mutation instead. A Mutant character begins play with 10 Corruption points. Instead of rolling as normal for malignancy or mutation, roll 5d10 on to determine a starting mutation.',
            },
            aptitudes: ['Fieldcraft', 'Offence'],
            source: 'PG 32 EI',
        },
        {
            name: 'Heretek',
            starting_skills: 'Deceive or Inquiry, Forbidden Lore (pick one), Medicae or Security, Tech-Use, Trade (pick one)',
            starting_talents: 'Weapon Training (Solid Projectile) Mechanicus Implants Trait',
            starting_equipment:
                'Stub revolver with 2 extra clips of Expander bullets or Man-Stopper rounds, 1 web grenade, combi-tool, flak cloak, filtration plugs, 1 dose of de-tox, dataslate, stab light',
            background_bonus: {
                name: 'Master of Hidden Lores',
                benefit:
                    'When a Heretek makes a Tech-Use test to comprehend, use, repair, or modify an unfamiliar device, he gains a +20 bonus if he has one or more relevant Forbidden Lore skill specialisations at Rank 1 (Known) or higher.',
            },
            aptitudes: ['Finesse', 'Tech'],
            source: 'PG 32 EO',
        },
        {
            name: 'Imperial Navy',
            starting_skills: 'Athletics, Command or Intimidate, Common Lore (Imperial Navy), Navigate (Stellar), Operate (Aeronautica or Voidship)',
            starting_talents: 'Weapon Training (Chain or Shock, Solid Projectile)',
            starting_equipment: 'Combat shotgun or hand cannon, chainsword or shock whip, flak coat, rebreather, micro-bead',
            background_bonus: {
                name: 'Close Quarters Discipline',
                benefit:
                    'An Imperial Navy character scores one additional degree of success on successful Ballistic Skill tests he makes against targets at Point-Blank range, at Short range, and with whom he is engaged in melee.',
            },
            aptitudes: ['Offence', 'Tech'],
            source: 'PG 34 EO',
        },
        {
            name: 'Rogue Trader',
            starting_skills:
                'Charm or Scrutiny, Commerce, Common Lore (Rogue Traders), Linguistics (pick one alien language), Operate (Surface or Aeronautica)',
            starting_talents: 'Weapon Training (Las or Solid Projectile, Shock)',
            starting_equipment: 'Laspistol or autopistol (fitted with Compact weapon upgrade), shock maul, mesh cloak or carapace chestplate, auspex, chrono',
            background_bonus: {
                name: 'Inured to the Xenos',
                benefit:
                    'A character from a Rogue Trader Fleet gains a +10 bonus to Fear tests caused by aliens and a +20 bonus to Interaction skill tests with alien characters.',
            },
            aptitudes: ['Finesse', 'Social'],
            source: 'PG 36 EO',
        },
        {
            name: 'Exorcised',
            starting_skills: 'Awareness, Deceive or Inquiry, Dodge, Forbidden Lore (Daemonology), Intimidate or Scrutiny',
            starting_talents: 'Hatred (Daemons), Weapon Training (Solid Projectile, Chain)',
            starting_equipment:
                'Autopistol or stub revolver, shotgun, chainblade, Imperial robes, 3 doses of obscura or tranq, disguise kit or excruciator kit, rebreather, stab light or glow-globe',
            background_bonus: {
                name: 'Touched by a Daemon',
                benefit:
                    'An Exorcised character starts with one Malignancy Chosen from the Malignancies table. An Exorcised character counts his Insanity bonus as 2 higher for purposes of avoiding Fear Tests. Additionally, he can never again become possessed by the same Daemon that once possessed him.',
            },
            aptitudes: ['Defence', 'Knowledge'],
            source: 'PG 32 EB',
        },
    ];
}

export function backgroundNames() {
    return backgrounds().map((b) => b.name);
}
