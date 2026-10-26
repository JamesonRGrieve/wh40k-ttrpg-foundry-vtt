/**
 * Unit coverage for the function-chosen pack icon table and resolver
 * (scripts/pack-icon-map.{json,mjs}, #625).
 *
 * The table replaced the unlicensed `_vendored-ui` art with game-icons.net icons
 * (CC BY 3.0), so it must stay a closed, attributable set: every icon a
 * game-icons hotlink on the CDN path src/icons/ATTRIBUTION.md documents, every
 * author credited there, every rule pointing at a real role. The resolver picks
 * by a document's structured data, never at random, and falls back to a neutral
 * per-type icon rather than a misleading one.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackIconDoc } from '../scripts/pack-icon-map.d.mts';
import { ICON_TABLE, iconRoleFor, iconUrl, iconUrlFor, isGameIconUrl } from '../scripts/pack-icon-map.mjs';
import { isDefaultImage } from '../src/module/rules/token-image-gen.ts';

const ATTRIBUTION = readFileSync(resolve(__dirname, '../src/icons/ATTRIBUTION.md'), 'utf8');

/** Every role a rule in the table can resolve to. */
function ruleRoles(): string[] {
    const { rules } = ICON_TABLE;
    const maps = [
        rules.conditionName,
        rules.itemTypeDefault,
        rules.actorTypeSuffixDefault,
        rules.weaponType,
        rules.weaponClass,
        rules.armourType,
        rules.talentCategory,
        rules.shipComponentType,
        rules.weaponExplosive,
    ];
    const lists = [rules.weaponNaturalName, rules.weaponName, rules.talentAptitude, rules.psychicDiscipline];
    return [rules.untypedDefault, ...maps.flatMap((m) => Object.values(m)), ...lists.flatMap((l) => l.map((r) => r.role))];
}

describe('pack icon table', () => {
    it('hotlinks game-icons.net on the CDN path ATTRIBUTION.md documents', () => {
        expect(ICON_TABLE.cdn).toBe('https://cdn.jsdelivr.net/gh/game-icons/icons@master');
        expect(ATTRIBUTION).toContain(`**CDN URL:** \`${ICON_TABLE.cdn}\``);
        expect(ICON_TABLE.licence).toBe('CC BY 3.0');
    });

    it('every icon is an <author>/<name> game-icons path by a credited author', () => {
        const entries = Object.entries(ICON_TABLE.icons);
        expect(entries.length).toBeGreaterThan(50);
        for (const [role, path] of entries) {
            expect(path, `${role} path`).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
            const author = path.split('/')[0] ?? '';
            expect(ICON_TABLE.authors[author], `${role}: author "${author}" has no credit entry`).toBeDefined();
            expect(iconUrl(role)).toBe(`${ICON_TABLE.cdn}/${path}.svg`);
            expect(isGameIconUrl(iconUrl(role))).toBe(true);
        }
    });

    it('credits every icon, with its author, in ATTRIBUTION.md', () => {
        const lines = ATTRIBUTION.split('\n');
        for (const path of new Set(Object.values(ICON_TABLE.icons))) {
            const author = ICON_TABLE.authors[path.split('/')[0] ?? ''];
            const line = lines.find((l) => l.includes(`\`${path}\``));
            expect(line, `${path} is not credited`).toBeDefined();
            expect(line, `${path} credited without its author`).toContain(`Icons made by **${author.name}**`);
        }
    });

    it('credits only authors the table uses', () => {
        const used = new Set(Object.values(ICON_TABLE.icons).map((p) => p.split('/')[0]));
        expect(Object.keys(ICON_TABLE.authors).sort()).toEqual([...used].sort());
    });

    it('every rule resolves to a defined role, and every pattern compiles', () => {
        for (const role of ruleRoles()) expect(ICON_TABLE.icons[role], `role ${role}`).toBeDefined();
        const { rules } = ICON_TABLE;
        for (const { pattern } of [...rules.weaponNaturalName, ...rules.weaponName, ...rules.talentAptitude, ...rules.psychicDiscipline]) {
            expect(() => new RegExp(pattern, 'i')).not.toThrow();
        }
    });

    it('never points at the unlicensed _vendored-ui art', () => {
        expect(JSON.stringify([ICON_TABLE.cdn, ICON_TABLE.icons])).not.toMatch(/_vendored-ui|wh40k-rpg\/icons\//);
    });

    it('counts as a placeholder for token image generation, like any default icon', () => {
        expect(isDefaultImage(iconUrl('vehicle.default'))).toBe(true);
        expect(isDefaultImage(iconUrl('weapon.las'))).toBe(true);
    });

    it('rejects an unknown role', () => {
        expect(() => iconUrl('weapon.lightsaber')).toThrow(/unknown icon role/);
    });
});

describe('iconRoleFor', () => {
    const weapon = (system: object, name = 'Test Weapon'): PackIconDoc => ({ name, type: 'weapon', system });

    it('maps every repointed condition by name', () => {
        expect(iconRoleFor({ name: 'Blinded', type: 'condition' })).toBe('condition.blinded');
        expect(iconRoleFor({ name: 'Blood Loss', type: 'condition' })).toBe('condition.blood-loss');
        expect(iconRoleFor({ name: 'Fire', type: 'condition' })).toBe('condition.fire');
        expect(iconRoleFor({ name: 'Pinned', type: 'condition' })).toBe('condition.pinned');
        expect(iconRoleFor({ name: 'Stunned', type: 'condition' })).toBe('condition.stunned');
        expect(iconRoleFor({ name: 'Surprised / Unaware', type: 'condition' })).toBe('condition.surprised');
        expect(iconRoleFor({ name: 'Ablaze', type: 'condition' })).toBe('condition.fire');
        expect(iconRoleFor({ name: "Nurgle's Breath", type: 'condition' })).toBe('condition.disease.nurgles-breath');
        expect(Object.keys(ICON_TABLE.rules.conditionName)).toHaveLength(28);
    });

    it('refuses to guess an icon for a condition the table has not chosen', () => {
        expect(() => iconRoleFor({ name: 'Frostbitten', type: 'condition' })).toThrow(/no icon chosen for condition/);
    });

    it('picks a weapon by its type first', () => {
        expect(iconRoleFor(weapon({ type: 'las', class: 'basic' }))).toBe('weapon.las');
        expect(iconRoleFor(weapon({ type: 'bolt', class: 'pistol' }))).toBe('weapon.bolt');
        expect(iconRoleFor(weapon({ type: 'plasma', class: 'heavy' }))).toBe('weapon.plasma');
        expect(iconRoleFor(weapon({ type: 'melta', class: 'basic' }))).toBe('weapon.melta');
        expect(iconRoleFor(weapon({ type: 'flame', class: 'basic' }))).toBe('weapon.flame');
        expect(iconRoleFor(weapon({ type: 'launcher', class: 'heavy' }))).toBe('weapon.launcher');
        expect(iconRoleFor(weapon({ type: 'chain', class: 'melee' }, 'Chain Axe'))).toBe('weapon.chain');
        expect(iconRoleFor(weapon({ type: 'power', class: 'melee' }, 'Power Axe'))).toBe('weapon.power');
        expect(iconRoleFor(weapon({ type: 'shock', class: 'melee' }))).toBe('weapon.shock');
        expect(iconRoleFor(weapon({ type: 'force', class: 'melee' }, 'Force Staff'))).toBe('weapon.force');
    });

    it('splits explosives into thrown grenades and other explosives', () => {
        expect(iconRoleFor(weapon({ type: 'explosive', class: 'thrown' }, 'Frag Grenade'))).toBe('weapon.grenade');
        expect(iconRoleFor(weapon({ type: 'explosive', class: 'placed' }, 'Demolition Charge'))).toBe('weapon.explosive');
    });

    it('reads a per-line or per-book variant container for type and class', () => {
        expect(iconRoleFor(weapon({ type: { dh2: 'las', rt: 'las' }, class: { dh2: 'pistol' } }))).toBe('weapon.las');
        expect(iconRoleFor(weapon({ type: { dh2: { __canonical: 'core', __books: { core: 'bolt' } } }, class: 'basic' }))).toBe('weapon.bolt');
        expect(iconRoleFor(weapon({ type: 'solid-projectile', class: { dh1: 'heavy' } }))).toBe('weapon.heavy');
    });

    it('falls back to a name keyword, then the class, for generic types', () => {
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'melee' }, 'Great Axe'))).toBe('weapon.axe');
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'melee' }, 'Dreadaxe'))).toBe('weapon.axe');
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'melee' }, 'Combat Knife'))).toBe('weapon.knife');
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'basic' }, 'Longbow'))).toBe('weapon.bow');
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'basic' }, 'Heavy Crossbow'))).toBe('weapon.crossbow');
        expect(iconRoleFor(weapon({ type: 'solid-projectile', class: 'basic' }, 'Combat Shotgun'))).toBe('weapon.shotgun');
        expect(iconRoleFor(weapon({ type: 'exotic', class: 'thrown' }, 'Eldar Plasma Grenade'))).toBe('weapon.grenade');
        expect(iconRoleFor(weapon({ type: 'exotic', class: 'basic' }, 'Auxiliary Grenade Launcher'))).toBe('weapon.launcher');
        expect(iconRoleFor(weapon({ type: 'solid-projectile', class: 'pistol' }, 'Stub Revolver'))).toBe('weapon.pistol');
        expect(iconRoleFor(weapon({ type: 'solid-projectile', class: 'basic' }, 'Autogun'))).toBe('weapon.basic');
        expect(iconRoleFor(weapon({ type: 'solid-projectile', class: 'heavy' }, 'Heavy Stubber'))).toBe('weapon.heavy');
        expect(iconRoleFor(weapon({ type: 'exotic', class: 'melee' }, 'Kursian Slivernet'))).toBe('weapon.melee');
    });

    it('recognises natural weapons by name before anything else', () => {
        expect(iconRoleFor(weapon({ type: 'exotic', class: 'melee' }, 'Rending Claws'))).toBe('weapon.claw');
        expect(iconRoleFor(weapon({ type: 'exotic', class: 'melee' }, 'Bite'))).toBe('weapon.bite');
        expect(iconRoleFor(weapon({ type: 'primitive', class: 'melee' }, 'Unarmed'))).toBe('weapon.unarmed');
    });

    it('gives an unclassifiable weapon the neutral weapon icon', () => {
        expect(iconRoleFor(weapon({}, 'Grav-Cannon'))).toBe('weapon.default');
        expect(iconRoleFor({ name: 'Mystery', type: 'weapon' })).toBe('weapon.default');
    });

    it('picks armour by its type, else the neutral armour icon', () => {
        expect(iconRoleFor({ name: 'Flak Vest', type: 'armour', system: { type: 'flak' } })).toBe('armour.flak');
        expect(iconRoleFor({ name: 'Carapace', type: 'armour', system: { type: { dh2: 'carapace' } } })).toBe('armour.carapace');
        expect(iconRoleFor({ name: 'Power Armour', type: 'armour', system: { type: 'power' } })).toBe('armour.power');
        expect(iconRoleFor({ name: 'Void Suit', type: 'armour', system: { type: 'void' } })).toBe('armour.void');
        expect(iconRoleFor({ name: 'Odd Plate', type: 'armour', system: { type: 'other' } })).toBe('armour.default');
    });

    it('picks a talent by its first aptitude, then its category, then the neutral talent icon', () => {
        expect(iconRoleFor({ name: 'Iron Jaw', type: 'talent', system: { aptitudes: ['Toughness', 'Defence'] } })).toBe('talent.toughness');
        expect(iconRoleFor({ name: 'Hip Shooting', type: 'talent', system: { aptitudes: ['Ballistic Skill or Weapon Skill', 'Finesse'] } })).toBe(
            'talent.ballistic-skill',
        );
        expect(iconRoleFor({ name: 'Peer', type: 'talent', system: { aptitudes: { dh2: ['Fellowship', 'Social'] } } })).toBe('talent.fellowship');
        expect(iconRoleFor({ name: 'Mark of Khorne', type: 'talent', system: { aptitudes: ['Khorne'] } })).toBe('talent.chaos');
        expect(iconRoleFor({ name: 'Bolter Drill', type: 'talent', system: { aptitudes: [], category: { rt: 'combat' } } })).toBe('talent.offence');
        expect(iconRoleFor({ name: 'Archivator', type: 'talent', system: { category: 'knowledge' } })).toBe('talent.knowledge');
        expect(iconRoleFor({ name: 'Betrayer', type: 'talent', system: { category: 'general' } })).toBe('talent.default');
        expect(iconRoleFor({ name: 'Bare', type: 'talent' })).toBe('talent.default');
    });

    it('picks a psychic power by its discipline, sanctic before daemonology before Chaos', () => {
        const power = (discipline: string | null): PackIconDoc => ({ name: 'Power', type: 'psychicPower', system: { discipline } });
        expect(iconRoleFor(power('Telepathy (Domination)'))).toBe('psychic.telepathy');
        expect(iconRoleFor(power('Pyromancy'))).toBe('psychic.pyromancy');
        expect(iconRoleFor(power('Biomancy'))).toBe('psychic.biomancy');
        expect(iconRoleFor(power("Divination\n(Emperor's Tarot)"))).toBe('psychic.divination');
        expect(iconRoleFor(power('Telekinetics'))).toBe('psychic.telekinesis');
        expect(iconRoleFor(power('Voidfrost\n(Cryokinesis)'))).toBe('psychic.cryokinesis');
        expect(iconRoleFor(power('Sanctic Daemonology'))).toBe('psychic.divine');
        expect(iconRoleFor(power('Malefic Daemonology'))).toBe('psychic.daemonology');
        expect(iconRoleFor(power('xChaos Powers\n(Tzeentch)'))).toBe('psychic.chaos');
        expect(iconRoleFor(power('Waaagh!\n(WAAAGH!)'))).toBe('psychic.waaagh');
        expect(iconRoleFor(power('Minor'))).toBe('psychic.default');
        expect(iconRoleFor(power(null))).toBe('psychic.default');
    });

    it('picks a ship component by its componentType', () => {
        expect(iconRoleFor({ name: 'Jovian Drive', type: 'shipComponent', system: { componentType: 'plasmaDrive' } })).toBe('shipComponent.drive');
        expect(iconRoleFor({ name: 'Void Shield', type: 'shipComponent', system: { componentType: 'voidShields' } })).toBe('shipComponent.shields');
        expect(iconRoleFor({ name: 'Brig', type: 'shipComponent', system: { componentType: 'supplemental' } })).toBe('shipComponent.default');
    });

    it('gives vehicles, journals and every other item type their neutral default', () => {
        expect(iconRoleFor({ name: 'Chimera', type: 'ow-terracraft' })).toBe('vehicle.default');
        expect(iconRoleFor({ name: 'Valkyrie', type: 'dh2-aircraft' })).toBe('vehicle.default');
        expect(iconRoleFor({ name: 'Daemonhosts' })).toBe('journal.default');
        expect(iconRoleFor({ name: 'Tyranid', type: 'trait' })).toBe('trait.default');
        expect(iconRoleFor({ name: 'Accurate', type: 'weaponQuality' })).toBe('weaponQuality.default');
        expect(iconRoleFor({ name: 'Hive World', type: 'originPath' })).toBe('originPath.default');
        expect(iconRoleFor({ name: 'Bloodtide', type: 'ritual' })).toBe('ritual.default');
        for (const [type, role] of Object.entries(ICON_TABLE.rules.itemTypeDefault)) {
            if (['weapon', 'armour', 'talent', 'psychicPower', 'shipComponent'].includes(type)) continue;
            expect(iconRoleFor({ name: 'X', type }), `type ${type}`).toBe(role);
        }
    });

    it('refuses a document type it has no rule for rather than guessing', () => {
        expect(() => iconRoleFor({ name: 'Lasgun', type: 'gear' })).toThrow(/no icon rule for document type "gear"/);
    });

    it('iconUrlFor returns the hotlink for the chosen role', () => {
        expect(iconUrlFor({ name: 'Blinded', type: 'condition' })).toBe(`${ICON_TABLE.cdn}/delapouite/blindfold.svg`);
    });
});
