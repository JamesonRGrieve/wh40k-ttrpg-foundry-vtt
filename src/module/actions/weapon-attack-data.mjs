import { WeaponRollData } from '../rolls/roll-data.mjs';
import { WeaponDamageData } from '../rolls/damage-data.mjs';

export class WeaponAttackData {
    rollData = WeaponRollData();
    damageData = WeaponDamageData();
    effects = [];
}
