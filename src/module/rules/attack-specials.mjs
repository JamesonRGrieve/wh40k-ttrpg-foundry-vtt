import { RollData } from '../rolls/roll-data.mjs';


export async function calculateAttackSpecialModifiers(rollData: RollData) {
    // Reset Attack Specials
    rollData.specialModifiers = {};

    let actionItem = rollData.weapon ?? rollData.power;

    for(const item of actionItem) {
        if(!item.system.equipped) continue;
        if(!item.isAttackSpecial) continue;
        switch(item.name) {
            case 'Scatter':
                if(this.data.rangeName === 'Point Blank' || this.data.rangeName === 'Short Range') {
                    rollData.specialModifiers['Scatter'] = 10;
                }
                break;
            case 'Indirect':
                rollData.specialModifiers['Indirect'] = 10;
                break;
            case 'Twin-Linked':
                rollData.specialModifiers['Twin-Linked'] = 20;
                break;
            case 'Defensive':
                rollData.specialModifiers['Defensive'] = -10;
                break;
            case 'Accurate':
                if(rollData.modifiers['aim'] > 0) {
                    rollData.specialModifiers['Accurate'] = 10;
                }
                break;
            case 'Inaccurate':
                if(rollData.modifiers['aim'] > 0){
                    rollData.specialModifiers['Inaccurate'] = -1 * rollData.modifiers['aim'];
                }
                break;
        }
    }
}

export function attackSpecials() {
    return [
        {
            name: 'Accurate',
            hasLevel: false,
        },
        {
            name: 'Balanced',
            hasLevel: false,
        },
        {
            name: 'Blast',
            hasLevel: true,
        },
        {
            name: 'Concussive',
            hasLevel: true,
        },
        {
            name: 'Corrosive',
            hasLevel: false,
        },
        {
            name: 'Crippling',
            hasLevel: true,
        },
        {
            name: 'Defensive',
            hasLevel: false,
        },
        {
            name: 'Felling',
            hasLevel: true,
        },
        {
            name: 'Flame',
            hasLevel: false,
        },
        {
            name: 'Flexible',
            hasLevel: false,
        },
        {
            name: 'Force',
            hasLevel: false,
        },
        {
            name: 'Graviton',
            hasLevel: false,
        },
        {
            name: 'Hallucinogenic',
            hasLevel: true,
        },
        {
            name: 'Haywire',
            hasLevel: true,
        },
        {
            name: 'Inaccurate',
            hasLevel: false,
        },
        {
            name: 'Indirect',
            hasLevel: true,
        },
        {
            name: 'Lance',
            hasLevel: false,
        },
        {
            name: 'Maximal',
            hasLevel: false,
        },
        {
            name: 'Melta',
            hasLevel: false,
        },
        {
            name: 'Overheats',
            hasLevel: false,
        },
        {
            name: 'Power Field',
            hasLevel: false,
        },
        {
            name: 'Primitive',
            hasLevel: true,
        },
        {
            name: 'Proven',
            hasLevel: true,
        },
        {
            name: 'Razor Sharp',
            hasLevel: false,
        },
        {
            name: 'Recharge',
            hasLevel: false,
        },
        {
            name: 'Reliable',
            hasLevel: false,
        },
        {
            name: 'Sanctified',
            hasLevel: false,
        },
        {
            name: 'Scatter',
            hasLevel: false,
        },
        {
            name: 'Smoke',
            hasLevel: true,
        },
        {
            name: 'Snare',
            hasLevel: true,
        },
        {
            name: 'Spray',
            hasLevel: false,
        },
        {
            name: 'Storm',
            hasLevel: false,
        },
        {
            name: 'Tearing',
            hasLevel: false,
        },
        {
            name: 'Toxic',
            hasLevel: true,
        },
        {
            name: 'Twin-Linked',
            hasLevel: false,
        },
        {
            name: 'Unbalanced',
            hasLevel: false,
        },
        {
            name: 'Unreliable',
            hasLevel: false,
        },
        {
            name: 'Unwieldy',
            hasLevel: false,
        },
        {
            name: 'Vengeful',
            hasLevel: true,
        },
    ];
}

export function attackSpecialsNames() {
    return attackSpecials().map((a) => a.name);
}
