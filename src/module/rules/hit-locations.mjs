export function getHitLocationForRoll(roll) {
    game.dh.log('getHitLocationForRoll', roll);
    const rollString = roll.toString().split('');
    const reverseArray = rollString.reverse();
    const joinArray = reverseArray.join('');
    const reverseInt = parseInt(joinArray);
    return creatureHitLocations().first((i) => (reverseInt >= i.min) && (reverseInt <= i.max))?.name;
}

export function getNextHitLocation(previousHit) {
    game.dh.log('getNextHitLocation', previousHit);
    const hitArray = hitLocationNames();
    let nextIndex = hitLocationNames().indexOf(previousHit) + 1;
    if (nextIndex > hitArray.length) {
        nextIndex = 0;
    }
    game.dh.log('getNextHitLocation', { hitArray, nextIndex });
    return hitArray[nextIndex];
}

export function hitDropdown() {
    const dropdown = {};
    creatureHitLocations().forEach((i) => {
        dropdown[i.name] = i.name;
    });
    return dropdown;
}

export function hitLocationNames() {
    return creatureHitLocations().map((i) => i.name);
}

export function creatureHitLocations() {
    return [
        {
            name: 'Head',
            min: 0,
            max: 10,
        },
        {
            name: 'Right Arm',
            min: 11,
            max: 20,
        },
        {
            name: 'Left Arm',
            min: 21,
            max: 30,
        },
        {
            name: 'Body',
            min: 31,
            max: 70,
        },
        {
            name: 'Right Leg',
            min: 71,
            max: 85,
        },
        {
            name: 'Left Leg',
            min: 86,
            max: 100,
        },
    ];
}
