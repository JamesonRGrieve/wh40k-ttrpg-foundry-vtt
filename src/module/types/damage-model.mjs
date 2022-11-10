export class DamageModel {
    constructor(data) {
        this.damage = data.damage;
        this.damageType = data.damageType;
        this.penetration = Number(data.penetration);
        this.special = data.special;
    }
}
