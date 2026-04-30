export function damageTypeDropdown() {
    const dropdown: Record<string, string> = {};
    damageType().forEach((i) => {
        dropdown[i.name] = i.name;
    });
    return dropdown;
}

export function damageTypeNames() {
    return damageType().map((i) => i.name);
}

export function damageType() {
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
