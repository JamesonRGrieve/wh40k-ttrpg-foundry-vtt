export function eliteAdvances() {
    return [
        {
            name: 'Inquisitor',
            cost: 1000,
            prerequisites:
                "Influence: 75, Emperor's Blessing: Do something to impress the Emperor. See Becoming an Inquisitor on page 88 of Core Rule Book. GM Guidance: If GM allows it.",
            changes: 'Gains the Peer (Inquisition) talent, the Forbidden Lore (Pick One) skill, and the Leadership Aptitude.',
            talents: [
                'Complete Control',
                'Fated',
                'Inspired Intuition',
                'Jack of all Trades',
                'Master of all Trades',
                'Shared Destiny',
                'Shield of Contempt',
                'Strength Through Conviction',
                'Will of the Inquisitor',
            ],
        },
        {
            name: 'Psyker',
            cost: 300,
            prerequisites:
                'Willpower: 40, A Beacon in the Warp: Cannot be an Untouchable, Rogue Psyker: Characters without the Adeptus Astra Telepathica background who gain the Psyker Elite advance are NOT sanctioned. They do not gain the Sanctioned trait and count as a rogue psyker.',
            changes:
                'Gains the Psyker Trait, the Psyker aptitude, and a psy rating of 1. Can not become a Untouchable for any reason. If the character does not have the Sanctioned trait he gains 1d10+3 corruption points.',
            talents: [],
        },
        {
            name: 'Untouchable',
            cost: 300,
            prerequisites: 'A Void in the warp: Cannot be a Psyker',
            changes:
                'Can no longer become a Psyker for any reason. Gains Resistance (Psychic powers) talent. Fellowship characteristic always count as half (rounding up) in value. Anyone with a psy rating or Psyniscience skill, the fellowship counts as 1. ' +
                'Can never gain nor benefit from positive effects of psychic powers or other related unnatural talents, traits, or abilities that call on the warp. Automatically ignores any effects from Psychic Phenomena and gains +30 to resists Perils of the warp."',
            talents: ['Demonic Anathema', 'Null Field', 'Soulless Aura', 'Warp Anathema', 'Warp Bane', 'Warp Disruption'],
        },
        {
            name: 'Sister of Battle',
            cost: 750,
            prerequisites: 'Influence 50, Willpower 40, Adepta Sororitas Background can undertake the harsh training to become Sisters of Battle.',
            changes:
                'Gain the Peer (Adepta Sororitas) and Weapon Training (Bolt) talents, the Scholastic Lore (Tactica Imperialis) skill, and the Willpower aptitude.',
            talents: [
                'Blessed Maryrdom',
                'Ceaseless Crusader',
                'Cleanse with Fire',
                'Divine Vengeance',
                "Emperor's Guidance",
                'Furious Zeal',
                'Spirit of the Martyr',
                'Shielding Faith',
                'Zealots Passion',
            ],
        },
        {
            name: 'Astropath',
            cost: 300,
            prerequisites:
                'Sanctioned Psyker: A character must possess the Psyker elite advance and the Adeptus Astra Telepathica background in order to gain the Astropath elite advance.',
            changes:
                '"Gains the Soul Bound trait. Rather than choosing a side effect, the character permanently loses his sight. Gains the Unnatural Senses (X) trait, where X equals the Astropath’s Willpower characteristic.',
            talents: ['Bound to the Highest Power', 'Supreme Telepath', 'Second Sight', 'Soul Ward', 'Warp Awareness'],
        },
    ];
}

export function eliteAdvancesNames() {
    return eliteAdvances().map((a) => a.name);
}
