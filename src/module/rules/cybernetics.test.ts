import { describe, expect, it } from 'vitest';
import {
    CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS,
    CYBERNETIC_SITE_MODIFIERS,
    classifyInstallSite,
    composeInstallTest,
    composeMaintenanceTest,
    degradeCraftsmanship,
    degreesOfFailure,
    degreesOfSuccess,
    resolveInstall,
    resolveMaintenance,
    rollRecoveryTime,
} from './cybernetics';

describe('classifyInstallSite (#125)', () => {
    it('maps brain/spine to the neural (hardest) site', () => {
        expect(classifyInstallSite(['brain'])).toBe('neural');
        expect(classifyInstallSite(['spine'])).toBe('neural');
    });

    it('maps organs/internal to the organ site', () => {
        expect(classifyInstallSite(['organs'])).toBe('organ');
        expect(classifyInstallSite(['internal'])).toBe('organ');
    });

    it('maps limbs/body/head to the limb site', () => {
        expect(classifyInstallSite(['leftArm'])).toBe('limb');
        expect(classifyInstallSite(['body'])).toBe('limb');
        expect(classifyInstallSite(['head'])).toBe('limb');
    });

    it('maps external sensory mounts (eyes/ears/mouth) to external', () => {
        expect(classifyInstallSite(['eyes'])).toBe('external');
        expect(classifyInstallSite(['ears'])).toBe('external');
        expect(classifyInstallSite(['mouth'])).toBe('external');
    });

    it('gates on the riskiest location when a device spans several', () => {
        expect(classifyInstallSite(['eyes', 'brain'])).toBe('neural');
        expect(classifyInstallSite(['leftArm', 'organs'])).toBe('organ');
        expect(classifyInstallSite(['eyes', 'leftLeg'])).toBe('limb');
    });

    it('defaults an empty set to external', () => {
        expect(classifyInstallSite([])).toBe('external');
    });
});

describe('composeInstallTest (#125)', () => {
    it('sums skill total + base difficulty + craftsmanship + site', () => {
        const c = composeInstallTest({
            baseDifficulty: -10,
            craftsmanship: 'good',
            site: 'limb',
            surgeonSkillTotal: 45,
        });
        // 45 + (-10) + (+10 good) + (0 limb) = 45
        expect(c.target).toBe(45);
        expect(c.netModifier).toBe(0);
    });

    it('folds the surgeon free-form modifier in only when non-zero', () => {
        const withMod = composeInstallTest({
            baseDifficulty: 0,
            craftsmanship: 'common',
            site: 'limb',
            surgeonSkillTotal: 40,
            surgeonModifier: 20,
        });
        expect(withMod.target).toBe(60);
        expect(withMod.breakdown.some((l) => l.label === 'Surgeon')).toBe(true);

        const noMod = composeInstallTest({
            baseDifficulty: 0,
            craftsmanship: 'common',
            site: 'limb',
            surgeonSkillTotal: 40,
            surgeonModifier: 0,
        });
        expect(noMod.breakdown.some((l) => l.label === 'Surgeon')).toBe(false);
    });

    it('a Poor implant in the neural site is materially harder than a Best limb implant', () => {
        const worst = composeInstallTest({
            baseDifficulty: 0,
            craftsmanship: 'poor',
            site: 'neural',
            surgeonSkillTotal: 50,
        });
        const best = composeInstallTest({
            baseDifficulty: 0,
            craftsmanship: 'best',
            site: 'limb',
            surgeonSkillTotal: 50,
        });
        // poor (-10) + neural (-20) = -30 ;  best (+20) + limb (0) = +20
        expect(worst.target).toBe(20);
        expect(best.target).toBe(70);
        expect(best.target).toBeGreaterThan(worst.target);
    });

    it('clamps a deeply-negative composition target to zero', () => {
        const c = composeInstallTest({
            baseDifficulty: -60,
            craftsmanship: 'poor',
            site: 'neural',
            surgeonSkillTotal: 20,
        });
        expect(c.target).toBe(0);
    });

    it('craftsmanship and site modifier tables are monotonic in the expected direction', () => {
        expect(CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS.poor).toBeLessThan(
            CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS.best,
        );
        expect(CYBERNETIC_SITE_MODIFIERS.neural).toBeLessThan(CYBERNETIC_SITE_MODIFIERS.external);
    });
});

describe('degreesOfSuccess / degreesOfFailure (#125)', () => {
    it('DoS is floor((target-roll)/10)+1 on a pass, 0 on a fail', () => {
        expect(degreesOfSuccess(10, 45)).toBe(4);
        expect(degreesOfSuccess(45, 45)).toBe(1);
        expect(degreesOfSuccess(46, 45)).toBe(0);
    });

    it('DoF is floor((roll-target)/10)+1 on a fail, 0 on a pass', () => {
        expect(degreesOfFailure(75, 45)).toBe(4);
        expect(degreesOfFailure(46, 45)).toBe(1);
        expect(degreesOfFailure(45, 45)).toBe(0);
    });
});

describe('resolveInstall (#125)', () => {
    const composition = composeInstallTest({
        baseDifficulty: 0,
        craftsmanship: 'common',
        site: 'limb',
        surgeonSkillTotal: 45,
    });

    it('a clean pass installs the implant with no consequence', () => {
        const r = resolveInstall(composition, 20);
        expect(r.success).toBe(true);
        expect(r.dos).toBeGreaterThanOrEqual(1);
        expect(r.bloodLoss).toBe(false);
        expect(r.faulty).toBe(false);
    });

    it('a marginal failure inflicts Blood Loss but does not leave the implant faulty', () => {
        // target 45, roll 55 → 2 DoF
        const r = resolveInstall(composition, 55);
        expect(r.success).toBe(false);
        expect(r.dof).toBe(2);
        expect(r.bloodLoss).toBe(true);
        expect(r.faulty).toBe(false);
    });

    it('a 3+ DoF failure additionally leaves the implant faulty', () => {
        // target 45, roll 75 → 4 DoF
        const r = resolveInstall(composition, 75);
        expect(r.success).toBe(false);
        expect(r.dof).toBe(4);
        expect(r.bloodLoss).toBe(true);
        expect(r.faulty).toBe(true);
    });

    it('echoes target/roll and carries the breakdown through for the chat card', () => {
        const r = resolveInstall(composition, 30);
        expect(r.target).toBe(45);
        expect(r.roll).toBe(30);
        expect(r.breakdown).toBe(composition.breakdown);
    });
});

describe('rollRecoveryTime (#125)', () => {
    it('is 2d10 minus Toughness Bonus, deterministic given a seeded rng', () => {
        // rng=0 → both d10 = 1, raw = 2 ; TB 3 → max(1, 2-3) = 1
        const r = rollRecoveryTime(3, () => 0);
        expect(r.raw).toBe(2);
        expect(r.days).toBe(1);
    });

    it('subtracts the Toughness Bonus from the 2d10 roll', () => {
        // rng=0.95 → both d10 = 10, raw = 20 ; TB 4 → 16 days
        const r = rollRecoveryTime(4, () => 0.95);
        expect(r.raw).toBe(20);
        expect(r.days).toBe(16);
    });

    it('never drops below the RAW one-day minimum', () => {
        const r = rollRecoveryTime(99, () => 0.5);
        expect(r.days).toBe(1);
    });

    it('treats a non-finite rng as 0', () => {
        const r = rollRecoveryTime(0, () => Number.NaN);
        expect(r.raw).toBe(2);
        expect(r.days).toBe(2);
    });
});

describe('degradeCraftsmanship (#125)', () => {
    it('steps one tier toward poor', () => {
        expect(degradeCraftsmanship('best')).toBe('good');
        expect(degradeCraftsmanship('good')).toBe('common');
        expect(degradeCraftsmanship('common')).toBe('poor');
    });

    it('floors at poor', () => {
        expect(degradeCraftsmanship('poor')).toBe('poor');
    });
});

describe('composeMaintenanceTest (#125)', () => {
    it('sums skill total + base difficulty + craftsmanship (no site term)', () => {
        const c = composeMaintenanceTest({
            baseDifficulty: 10,
            craftsmanship: 'common',
            maintainerSkillTotal: 40,
        });
        expect(c.target).toBe(50);
        expect(c.breakdown.some((l) => l.label === 'Site')).toBe(false);
    });

    it('folds the extra modifier in only when non-zero and clamps at zero', () => {
        const withExtra = composeMaintenanceTest({
            baseDifficulty: 0,
            craftsmanship: 'poor',
            maintainerSkillTotal: 30,
            extraModifier: 15,
        });
        // 30 + 0 + (-10 poor) + 15 = 35
        expect(withExtra.target).toBe(35);
        expect(withExtra.breakdown.some((l) => l.label === 'Other')).toBe(true);

        const clamped = composeMaintenanceTest({
            baseDifficulty: -60,
            craftsmanship: 'poor',
            maintainerSkillTotal: 10,
        });
        expect(clamped.target).toBe(0);
    });
});

describe('resolveMaintenance (#125)', () => {
    const comp = composeMaintenanceTest({
        baseDifficulty: 10,
        craftsmanship: 'good',
        maintainerSkillTotal: 40,
    }); // target = 40 + 10 + 10 = 60

    it('a successful upkeep holds the current craftsmanship tier', () => {
        const r = resolveMaintenance('good', comp, 30);
        expect(r.success).toBe(true);
        expect(r.resultingCraftsmanship).toBe('good');
        expect(r.malfunction).toBe(false);
    });

    it('a marginal failure degrades one tier without a malfunction', () => {
        // target 60, roll 70 → 2 DoF
        const r = resolveMaintenance('good', comp, 70);
        expect(r.success).toBe(false);
        expect(r.dof).toBe(2);
        expect(r.resultingCraftsmanship).toBe('common');
        expect(r.malfunction).toBe(false);
    });

    it('a severe (3+ DoF) failure degrades AND malfunctions', () => {
        // target 60, roll 90 → 4 DoF
        const r = resolveMaintenance('good', comp, 90);
        expect(r.success).toBe(false);
        expect(r.dof).toBe(4);
        expect(r.resultingCraftsmanship).toBe('common');
        expect(r.malfunction).toBe(true);
    });

    it('any failure on an already-Poor device malfunctions (cannot degrade further)', () => {
        const poorComp = composeMaintenanceTest({
            baseDifficulty: 0,
            craftsmanship: 'poor',
            maintainerSkillTotal: 40,
        }); // target = 40 + 0 - 10 = 30
        // roll 35 → 1 DoF, marginal, but Poor cannot degrade → malfunction
        const r = resolveMaintenance('poor', poorComp, 35);
        expect(r.success).toBe(false);
        expect(r.dof).toBe(1);
        expect(r.resultingCraftsmanship).toBe('poor');
        expect(r.malfunction).toBe(true);
    });

    it('carries the breakdown through for the chat card', () => {
        const r = resolveMaintenance('good', comp, 10);
        expect(r.breakdown).toBe(comp.breakdown);
    });
});
