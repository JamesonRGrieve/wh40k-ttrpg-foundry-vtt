export function getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

export function modifiersToRollData(modifiers) {
    let formula = '0 ';
    const rollParams = {};
    for (const modifier of Object.keys(modifiers)) {
        if (modifiers[modifier] !== 0) {
            if (modifiers[modifier] >= 0) {
                formula += ` + @${modifier}`;
            } else {
                formula += ` - @${modifier}`;
            }
            rollParams[modifier] = Math.abs(modifiers[modifier]);
        }
    }
    return {
        formula: formula,
        params: rollParams,
    };
}

export async function totalModifiers(modifiers) {
    const rollDetails = modifiersToRollData(modifiers);
    const roll = new Roll(rollDetails.formula, rollDetails.params);
    await roll.evaluate({ async: true });
    if (roll.total > 60) {
        return 60;
    } else if (roll.total < -60) {
        return -60;
    } else {
        return roll.total;
    }
}

export async function roll1d100() {
    let formula = '1d100';
    const roll = new Roll(formula, {});
    await roll.evaluate({ async: true });
    return roll;
}

export async function determineSuccess(attackData) {
    let roll = attackData.rollData.roll;
    let rollTotal = roll.total;
    const target = attackData.rollData.modifiedTarget;

    let actionItem = attackData.rollData.weapon ?? attackData.rollData.power;
    let hit = rollTotal === 1 || rollTotal <= target && rollTotal !== 100;

    // Ranged Weapon Checks
    if (actionItem.isRanged) {
        if(rollTotal > 91 && actionItem.hasAttackSpecial('Overheats')) {
            attackData.effects.push('overheat');
        }
        if ((!actionItem.hasAttackSpecial('Reliable') && rollTotal > 96) || rollTotal === 100) {
            attackData.effects.push('jam');
        }
    } else if (actionItem.isMelee) {
        if(!hit) {
            // Re-Roll Attack for Blademaster
            if(attackData.rollData.sourceActor.hasTalent('Blademaster')) {
                attackData.effects.push('blademaster');
                attackData.rollData.previousRolls.push(roll);
                attackData.rollData.roll = await roll1d100();
                roll = attackData.rollData.roll;
                rollTotal = roll.total;
                hit = rollTotal === 1 || rollTotal <= target && rollTotal !== 100;
            }
        }
    }

    const successData = {
        success: hit
    };
    if (successData.success) {
        successData.dof = 0;
        successData.dos = 1 + getDegree(target, roll.total);
    } else {
        successData.dos = 0;
        successData.dof = 1 + getDegree(roll.total, target);
    }
    return successData;
}

export function recursiveUpdate(targetObject, updateObject) {
    for (const key of Object.keys(updateObject)) {
        handleDotNotationUpdate(targetObject, key, updateObject[key]);
    }
}

export function handleDotNotationUpdate(targetObject, key, value) {
    if (typeof key == 'string') {
        // Key Starts as string and we split across dots
        handleDotNotationUpdate(targetObject, key.split('.'), value);
    } else if (key.length === 1) {
        // Final Key -- either delete or set parent field
        if (value === undefined || value === null) {
            delete targetObject[key[0]];
        } else if ('object' === typeof value && !Array.isArray(value)) {
            recursiveUpdate(targetObject[key[0]], value);
        } else {
            // Coerce numbers
            if ('number' === typeof targetObject[key[0]]) {
                targetObject[key[0]] = Number(value);
            } else {
                targetObject[key[0]] = value;
            }
        }
    } else {
        // Go a layer deeper into object
        handleDotNotationUpdate(targetObject[key[0]], key.slice(1), value);
    }
}
