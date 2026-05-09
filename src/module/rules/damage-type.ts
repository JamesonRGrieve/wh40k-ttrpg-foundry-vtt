export function damageTypeDropdown(): Record<string, string> {
    const dropdown: Record<string, string> = {};
    damageType().forEach((i) => {
        dropdown[i.name] = i.name;
    });
    return dropdown;
}

export function damageTypeNames(): string[] {
    return damageType().map((i) => i.name);
}

export function damageType(): { name: string }[] {
    return [
        {
            name: 'Energy',
        },
        {
            name: 'Explosive',
        },
        {
            name: 'Impact',
        },
        {
            name: 'Rending',
        },
    ];
}
