/**
 * Reverse the digits of a d100 attack-roll result to derive the hit-
 * location lookup index per core.md L10372-10390 (Table 7-3).
 *
 * Examples: 23 → 32 (Body), 47 → 74 (Right Leg), 100 → 001 → 1 (Head).
 * Doubles / palindromes (33, 55) pass through unchanged.
 *
 * Pure — extracted from `getHitLocationForRoll` so the reversal math is
 * unit-testable without the Foundry `game` runtime.
 */
export function reverseAttackRollDigits(roll: number): number {
    const normalised = Number.isFinite(roll) ? Math.trunc(roll) : 0;
    return parseInt(normalised.toString().split('').reverse().join(''), 10);
}

export function getHitLocationForRoll(roll: number): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: game.wh40k may be undefined in pure-rules tests; guard is intentional
    if (typeof game !== 'undefined' && game.wh40k !== undefined) {
        game.wh40k.log('getHitLocationForRoll', roll);
    }
    const reverseInt = reverseAttackRollDigits(roll);
    return creatureHitLocations().find((i) => reverseInt >= i.min && reverseInt <= i.max)?.name;
}

export function hitDropdown(): Record<string, string> {
    const dropdown: Record<string, string> = {};
    creatureHitLocations().forEach((i) => {
        dropdown[i.name] = i.name;
    });
    return dropdown;
}

export function hitLocationNames(): string[] {
    return creatureHitLocations().map((i) => i.name);
}

export function additionalHitLocations(): Record<string, string[]> {
    return {
        'Head': ['Head', 'Head', 'Right Arm', 'Body', 'Left Arm', 'Body'],
        'Right Arm': ['Right Arm', 'Right Arm', 'Body', 'Head', 'Body', 'Right Arm'],
        'Left Arm': ['Left Arm', 'Left Arm', 'Body', 'Head', 'Body', 'Left Arm'],
        'Body': ['Body', 'Body', 'Left Arm', 'Head', 'Right Arm', 'Body'],
        'Right Leg': ['Right Leg', 'Right Leg', 'Body', 'Right Arm', 'Head', 'Body'],
        'Left Leg': ['Left Leg', 'Left Leg', 'Body', 'Left Arm', 'Head', 'Body'],
    };
}

export function creatureHitLocations(): { name: string; min: number; max: number }[] {
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
