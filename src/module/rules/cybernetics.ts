/**
 * Cybernetics install / maintain engine (#125 — core.md §"Attaching
 * Bionics and Implants", p. 181; §"Craftsmanship", p. 141).
 *
 * RAW summary the engine encodes:
 *  - **Install** is a Medicae (or Tech-Use) test performed by a willing
 *    chirurgeon. RAW leaves the base difficulty to the GM; this engine
 *    composes a target from a GM-picked base difficulty band + the
 *    craftsmanship of the device + the body location being augmented
 *    (replacing an internal organ / the spine is harder than bolting on
 *    an external augmetic). A surgeon's free-form modifier (skilled
 *    facility, rushed job, Superior Chirurgeon talent, etc.) folds in
 *    on top.
 *  - **Recovery** takes 2d10 days minus the recipient's Toughness Bonus,
 *    to a minimum of one day. The roll is injectable so stories/tests
 *    stay deterministic.
 *  - **Failure consequence**: a failed install is a botched surgery —
 *    1+ DoF inflicts Blood Loss and 1d5 damage; 3+ DoF additionally
 *    leaves the implant *faulty* (it works at a degraded tier until
 *    re-installed). Both surface as flags the UI layer turns into
 *    chat-card text / Active Effects.
 *  - **Maintenance**: a periodic Tech-Use (or Medicae) test keeps a
 *    cybernetic from degrading. A failed maintenance test drops the
 *    device's effective craftsmanship one tier and, on a 3+ DoF, the
 *    implant *malfunctions* (suppressed until repaired) — the
 *    long-term maintenance hook the issue calls for.
 *
 * This module is pure logic. No content lives here: the per-implant
 * difficulty / recovery / maintenance values are authored on the
 * compendium `CyberneticData.installation` schema and passed in by the
 * caller. The engine only composes the math and resolves pass/fail —
 * it never name-matches a specific cybernetic (Direction #7).
 *
 * The install / maintain tests are DH2-canonical. The math is
 * content-agnostic d100 roll-under composition, so it does not regress
 * the other six lines; only the DH2 character-sheet surfaces wire it.
 */

/* -------------------------------------------- */
/*  Craftsmanship → effective install band      */
/* -------------------------------------------- */

/** Four canonical craftsmanship tiers (core.md p. 141). */
export type CyberneticCraftsmanship = 'poor' | 'common' | 'good' | 'best';

/**
 * Craftsmanship modifier on the install Medicae test. Better-made
 * implants slot in cleaner (RAW p. 141: craftsmanship "covers how well
 * it has been maintained" and a Best device "rarely provide[s]
 * additional benefits beyond ... Good ... but [is] far more impressive
 * in ... construction"). Mirrors the requisition-test ladder direction
 * (a worse-made device is harder to fit safely).
 */
export const CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS: Record<CyberneticCraftsmanship, number> = {
    poor: -10,
    common: 0,
    good: 10,
    best: 20,
};

/* -------------------------------------------- */
/*  Body location → surgical complexity         */
/* -------------------------------------------- */

/**
 * Body-location bands the cybernetic schema's `locations` set resolves
 * onto. Replacing an internal organ or wiring the spine is materially
 * more dangerous than bolting an augmetic onto a limb, which is in turn
 * harder than an external mechadendrite mount.
 */
export type CyberneticInstallSite = 'external' | 'limb' | 'organ' | 'neural';

/** Surgical-complexity modifier per install site (harder = more negative). */
export const CYBERNETIC_SITE_MODIFIERS: Record<CyberneticInstallSite, number> = {
    external: 10,
    limb: 0,
    organ: -10,
    neural: -20,
};

/**
 * Map a cybernetic's schema `locations` set onto the most dangerous
 * install site it touches (the test is gated by the riskiest location).
 * Pure: takes the raw location identifiers from `CyberneticData.locations`.
 */
const LOCATION_TO_SITE: Record<string, CyberneticInstallSite> = {
    brain: 'neural',
    spine: 'neural',
    organs: 'organ',
    internal: 'organ',
    leftArm: 'limb',
    rightArm: 'limb',
    leftLeg: 'limb',
    rightLeg: 'limb',
    body: 'limb',
    head: 'limb',
    // eyes / ears / mouth and any future external mounts fall through to 'external'.
};

export function classifyInstallSite(locations: Iterable<string>): CyberneticInstallSite {
    let worst: CyberneticInstallSite = 'external';
    const rank: Record<CyberneticInstallSite, number> = { external: 0, limb: 1, organ: 2, neural: 3 };
    for (const loc of locations) {
        const site: CyberneticInstallSite = LOCATION_TO_SITE[loc] ?? 'external';
        if (rank[site] > rank[worst]) worst = site;
    }
    return worst;
}

/* -------------------------------------------- */
/*  Install test composition                    */
/* -------------------------------------------- */

export interface InstallTestInput {
    /**
     * GM-picked base difficulty band for the surgery (the d100 modifier
     * — e.g. 0 Challenging, −20 Hard). RAW leaves this to the GM; the
     * dialog surfaces the standard difficulty ladder.
     */
    baseDifficulty: number;
    /** Device craftsmanship (drives {@link CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS}). */
    craftsmanship: CyberneticCraftsmanship;
    /** The riskiest install site the device touches. */
    site: CyberneticInstallSite;
    /**
     * The chirurgeon's effective Medicae (or Tech-Use) characteristic
     * total *before* difficulty modifiers (skill characteristic + bonus).
     */
    surgeonSkillTotal: number;
    /** Free-form surgeon modifier (facility quality, Superior Chirurgeon, rushed job, …). */
    surgeonModifier?: number;
}

export interface TestModifierLine {
    label: string;
    value: number;
}

export interface InstallTestComposition {
    /** Final d100 target the chirurgeon rolls under. Clamped to ≥ 0. */
    target: number;
    /** Net modifier applied to the surgeon's skill total. */
    netModifier: number;
    /** Per-source breakdown for chat-card display. */
    breakdown: TestModifierLine[];
}

/**
 * Compose the install Medicae test target. Pure: identical inputs ⇒
 * identical output. The breakdown drives the chat card; labels are
 * stable identifiers (the UI localizes them).
 */
export function composeInstallTest(input: InstallTestInput): InstallTestComposition {
    const breakdown: TestModifierLine[] = [];
    breakdown.push({ label: 'SkillTotal', value: input.surgeonSkillTotal });
    breakdown.push({ label: 'BaseDifficulty', value: input.baseDifficulty });
    breakdown.push({
        label: 'Craftsmanship',
        value: CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS[input.craftsmanship],
    });
    breakdown.push({ label: 'Site', value: CYBERNETIC_SITE_MODIFIERS[input.site] });
    if (input.surgeonModifier !== undefined && input.surgeonModifier !== 0) {
        breakdown.push({ label: 'Surgeon', value: input.surgeonModifier });
    }

    const netModifier =
        input.baseDifficulty +
        CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS[input.craftsmanship] +
        CYBERNETIC_SITE_MODIFIERS[input.site] +
        (input.surgeonModifier ?? 0);

    const target = Math.max(0, input.surgeonSkillTotal + netModifier);
    return { target, netModifier, breakdown };
}

/* -------------------------------------------- */
/*  Degrees of success / failure                */
/* -------------------------------------------- */

/**
 * Degrees of Success (roll ≤ target): floor((target − roll) / 10) + 1.
 * A failed roll yields 0 DoS.
 */
export function degreesOfSuccess(roll: number, target: number): number {
    if (roll > target) return 0;
    return Math.floor((target - roll) / 10) + 1;
}

/**
 * Degrees of Failure (roll > target): floor((roll − target) / 10) + 1.
 * A passing roll yields 0 DoF.
 */
export function degreesOfFailure(roll: number, target: number): number {
    if (roll <= target) return 0;
    return Math.floor((roll - target) / 10) + 1;
}

/* -------------------------------------------- */
/*  Install resolution                          */
/* -------------------------------------------- */

export interface InstallResolution {
    /** True when the surgery succeeded (implant is correctly fitted). */
    success: boolean;
    /** Degrees of success (0 on failure). */
    dos: number;
    /** Degrees of failure (0 on success). */
    dof: number;
    /** Final composed target (echoed for chat-card convenience). */
    target: number;
    /** The d100 roll the surgeon made (echoed for chat-card convenience). */
    roll: number;
    /**
     * Botched surgery: any failure inflicts Blood Loss + 1d5 damage.
     * False on success.
     */
    bloodLoss: boolean;
    /**
     * Faulty install: a 3+ DoF failure fits the implant badly. It still
     * functions but at one craftsmanship tier lower until re-installed.
     * False on success or a marginal (1–2 DoF) failure.
     */
    faulty: boolean;
    /** Modifier breakdown carried through for the chat card. */
    breakdown: TestModifierLine[];
}

/**
 * Resolve an install attempt. Pure: pass the pre-composed target, the
 * surgeon's 1d100 roll, and the breakdown. The UI rolls the dice and
 * the post-install damage/AE; the engine only classifies the outcome.
 */
export function resolveInstall(composition: InstallTestComposition, roll: number): InstallResolution {
    const { target, breakdown } = composition;
    const success = roll <= target;
    const dos = degreesOfSuccess(roll, target);
    const dof = degreesOfFailure(roll, target);
    return {
        success,
        dos,
        dof,
        target,
        roll,
        bloodLoss: !success,
        faulty: !success && dof >= 3,
        breakdown,
    };
}

/* -------------------------------------------- */
/*  Recovery time                               */
/* -------------------------------------------- */

/** Injectable RNG signature: a 0..1 generator (matches `Math.random`). */
export type Rng = () => number;

/** Roll a single dN face (1..n) from a 0..1 rng. */
function rollDie(faces: number, rng: Rng): number {
    const raw = Number(rng());
    const r = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
    return Math.floor(r * faces) + 1;
}

export interface RecoveryResult {
    /** The raw 2d10 roll before the Toughness reduction. */
    raw: number;
    /** Final recovery duration in days (RAW minimum of 1). */
    days: number;
}

/**
 * Recovery is 2d10 days minus the recipient's Toughness Bonus, to a
 * minimum of one day (core.md p. 181). `rng` defaults to `Math.random`
 * but is injected by stories/tests for determinism.
 */
export function rollRecoveryTime(toughnessBonus: number, rng: Rng = Math.random): RecoveryResult {
    const raw = rollDie(10, rng) + rollDie(10, rng);
    const days = Math.max(1, raw - Math.trunc(toughnessBonus));
    return { raw, days };
}

/* -------------------------------------------- */
/*  Long-term maintenance                       */
/* -------------------------------------------- */

export interface MaintenanceTestInput {
    /**
     * GM-picked base difficulty band for the upkeep test (the d100
     * modifier). Routine maintenance in a proper facility is Ordinary
     * (+10) or better; field upkeep is harder.
     */
    baseDifficulty: number;
    /** Current effective craftsmanship of the device. */
    craftsmanship: CyberneticCraftsmanship;
    /** The maintainer's Tech-Use (or Medicae) characteristic total. */
    maintainerSkillTotal: number;
    /** Free-form modifier (sacred unguents, tools to hand, Mechanicus rites, …). */
    extraModifier?: number;
}

/**
 * Compose the maintenance test target. Same composition shape as the
 * install test minus the surgical-site term (upkeep is the same effort
 * regardless of where the device sits) — a worse-made device is harder
 * to keep running, so craftsmanship reuses the install ladder.
 */
export function composeMaintenanceTest(input: MaintenanceTestInput): InstallTestComposition {
    const breakdown: TestModifierLine[] = [];
    breakdown.push({ label: 'SkillTotal', value: input.maintainerSkillTotal });
    breakdown.push({ label: 'BaseDifficulty', value: input.baseDifficulty });
    breakdown.push({
        label: 'Craftsmanship',
        value: CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS[input.craftsmanship],
    });
    if (input.extraModifier !== undefined && input.extraModifier !== 0) {
        breakdown.push({ label: 'Other', value: input.extraModifier });
    }

    const netModifier = input.baseDifficulty + CYBERNETIC_CRAFTSMANSHIP_INSTALL_MODIFIERS[input.craftsmanship] + (input.extraModifier ?? 0);

    const target = Math.max(0, input.maintainerSkillTotal + netModifier);
    return { target, netModifier, breakdown };
}

/** Craftsmanship ladder, worst → best, for one-tier degradation steps. */
const CRAFTSMANSHIP_LADDER: ReadonlyArray<CyberneticCraftsmanship> = ['poor', 'common', 'good', 'best'];

/**
 * Degrade a craftsmanship tier by one step toward `poor`. `poor` is the
 * floor (a poorly-maintained Poor device just stays Poor and
 * malfunctions instead — see {@link resolveMaintenance}).
 */
export function degradeCraftsmanship(craft: CyberneticCraftsmanship): CyberneticCraftsmanship {
    const idx = CRAFTSMANSHIP_LADDER.indexOf(craft);
    if (idx <= 0) return 'poor';
    return CRAFTSMANSHIP_LADDER[idx - 1] ?? 'poor';
}

export interface MaintenanceResolution {
    /** True when upkeep succeeded — the device holds its current tier. */
    success: boolean;
    /** Degrees of success (0 on failure). */
    dos: number;
    /** Degrees of failure (0 on success). */
    dof: number;
    /** Composed target (echoed for chat). */
    target: number;
    /** The maintainer's 1d100 roll (echoed for chat). */
    roll: number;
    /** Craftsmanship tier the device sits at after this test resolves. */
    resultingCraftsmanship: CyberneticCraftsmanship;
    /**
     * Malfunction: a 3+ DoF failure (or any failure on an already-Poor
     * device) suppresses the cybernetic until it is repaired. The UI
     * layer turns this into a malfunction Active Effect.
     */
    malfunction: boolean;
    /** Modifier breakdown carried through for the chat card. */
    breakdown: TestModifierLine[];
}

/**
 * Resolve a maintenance attempt. On success the device holds its tier.
 * On failure it drops one craftsmanship tier; a severe failure (3+ DoF)
 * — or any failure on a Poor device that cannot degrade further —
 * additionally triggers a malfunction (the long-term maintenance hook
 * the issue requires). Pure: dice + composed target in, classification
 * out.
 */
export function resolveMaintenance(currentCraftsmanship: CyberneticCraftsmanship, composition: InstallTestComposition, roll: number): MaintenanceResolution {
    const { target, breakdown } = composition;
    const success = roll <= target;
    const dos = degreesOfSuccess(roll, target);
    const dof = degreesOfFailure(roll, target);

    if (success) {
        return {
            success: true,
            dos,
            dof,
            target,
            roll,
            resultingCraftsmanship: currentCraftsmanship,
            malfunction: false,
            breakdown,
        };
    }

    const degraded = degradeCraftsmanship(currentCraftsmanship);
    const cannotDegrade = degraded === currentCraftsmanship; // already Poor
    const malfunction = dof >= 3 || cannotDegrade;
    return {
        success: false,
        dos,
        dof,
        target,
        roll,
        resultingCraftsmanship: degraded,
        malfunction,
        breakdown,
    };
}
