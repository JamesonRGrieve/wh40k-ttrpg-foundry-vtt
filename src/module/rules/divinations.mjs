export function divinations() {
    return [
        {
            name: 'Mutation without, corruption within.',
            effect: 'Roll once on the Malignancies table and apply the result.',
            roll: '01',
        },
        {
            name: 'Dark dreams lie upon the heart.',
            effect: 'Whenever this character would roll on the Malignancies table, he may instead select any one result and gain that Malignancy.',
            roll: '50-54',
        },
        {
            name: 'Trust in your fear.',
            effect: "Increase this character's Perception by 5. He also gains the Phobia Mental Disorder.",
            roll: '02-05',
        },
        {
            name: 'Violence solves everything.',
            effect: "Increase this character's Weapon Skill or Ballistic Skill characteristic by 3. Reduce his Agility or Intelligence characteristic by 3.",
            roll: '55-59',
        },
        {
            name: 'Humans must die so that humanity can endure.',
            effect: 'This character gains the Jaded talent. If he already possesses this talent, increase his Willpower characteristic by 2 instead.',
            roll: '06-09',
        },
        {
            name: 'Ignorance is a wisdom of its own.',
            effect: "Reduce this character's Perception characteristic by 3. The first time he would gain 1 or more Insanity points each session, he reduces that amount by 1 (to a minimum of 0) instead.",
            roll: '60-63',
        },
        {
            name: 'The pain of the bullet is ecstasy compared to damnation.',
            effect: "Reduce this character's Agility characteristic by 3. The first time this character suffers Critical damage each session, roll a 1d10. On a result of 10, he does not suffer any Critical Effects, though the damage still counts as Critical Damage.",
            roll: '10-13',
        },
        {
            name: 'Only the insane have the strength to prosper.',
            effect: "Increase this character's Willpower characteristic by 3. The first time he would gain 1 or more Insanity points each session, he gains that amount plus 1 instead.",
            roll: '64-67',
        },
        {
            name: 'Be a boon to your allies and the bane of your enemies.',
            effect: 'The character gains the Hatred (choose any one) talent. If he already possessed this talent, increase his Strength characteristic by 2 instead.',
            roll: '14-17',
        },
        {
            name: 'A suspicious mind is a healthy mind.',
            effect: "Increase this character's Perception characteristic by 2. Additionally, he may re-roll Awareness tests to avoid being Surprised.",
            roll: '68-71',
        },
        {
            name: 'The wise learn from the deaths of others.',
            effect: "Increase this character's Agility or Intelligence Characteristic by 3. Reduce his Weapon Skill or Ballistic skill characteristic by 3.",
            roll: '18-21',
        },
        {
            name: 'Suffering is an unrelenting instructor.',
            effect: "Reduce this character's Toughness characteristic by 3. The first time that this character suffers any damage each session, he gains a +20 bonus to the next test he makes before the end of his next turn.",
            roll: '72-75',
        },
        {
            name: 'Kill the alien before it can speak its lies.',
            effect: 'This character gains the Quick Draw talent. If he already possesses this talent, increase his Agility characteristic by 2 instead.',
            roll: '22-25',
        },
        {
            name: 'The only true fear is dying without your duty done.',
            effect: 'This character gains the Resistance (Cold, Heat, or Fear) talent. If he already possesses this Talent, increase his Toughness characteristic by 2 instead.',
            roll: '76-79',
        },
        {
            name: 'Truth is subjective.',
            effect: "Increase this character's Perception by 3. The first time he would gain 1 or more Corruption points each session, he gains that amount plus 1 instead.",
            roll: '26-29',
        },
        {
            name: 'Only in death does duty end.',
            effect: 'The first time this character would suffer Fatigue each session, he suffers that amount of Fatigue minus 1 (to a minimum of 0) instead.',
            roll: '80-83',
        },
        {
            name: 'Thought begets Heresy.',
            effect: "Reduce this character's Intelligence by 3. The first time he would gain 1 or more Corruption points each session, he reduces that amount by 1 (to a minimum of 0) instead.",
            roll: '30-33',
        },
        {
            name: 'Innocence is an illusion.',
            effect: 'This character gains the Keen Intuition talent. If he already possesses this talent, increase his Intelligence characteristic by 2 instead.',
            roll: '84-87',
        },
        {
            name: 'Heresy begets Retribution.',
            effect: "Increase this character's Fellowship or Strength characteristic by 3. Reduce his Toughness or Willpower characteristic by 3.",
            roll: '34-38',
        },
        {
            name: 'To war is human.',
            effect: 'This character gains the Dodge skill as a Known skill (rank 1). If he already posses this skill, increase his Agility characteristic by 2 instead.',
            roll: '88-91',
        },
        {
            name: 'A mind without purpose wanders in dark places.',
            effect: 'When gaining Mental Disorders, the character may choose to gain a new Disorder instead of increasing the severity of an existing Disorder.',
            roll: '39-43',
        },
        {
            name: 'There is no substitute for zeal.',
            effect: 'This character gains the Clues from the Crowds talent. If he already possesses this talent, increase his Fellowship characteristic by 2 instead.',
            roll: '92-95',
        },
        {
            name: 'If a job is worth doing, it is worth dying for.',
            effect: "Increase this character's Toughness or Willpower characteristic by 3. Reduce his Fellowship or Strength characteristic by 3.",
            roll: '44-49',
        },
        {
            name: 'Even one who has nothing can still offer his life.',
            effect: 'When this character burns Fate threshold to survive a lethal injury, roll 1d10. On a result of 10, he survives whatever grievous wound would have killed him but does not reduce his Fate threshold.',
            roll: '96-99',
        },
        {
            name: 'Do not ask why you serve. Only ask how.',
            effect: "Increase this character's Fate threshold by 1.",
            roll: '100',
        },
    ];
}

export function divinationNames() {
    return divinations().map((d) => d.name);
}
