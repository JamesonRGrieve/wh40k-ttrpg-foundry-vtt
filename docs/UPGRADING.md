# Upgrading

## Before You Update
- Back up your world data and any custom modules.
- Review the release notes for breaking changes or required configuration tweaks.
- Disable experimental sheet modules that override actor registrations to avoid conflicts during startup.

## Running Migrations
- Launch your world and allow the system to load fully; migrations will run automatically via `checkAndMigrateWorld()` during the `ready` hook.
- Keep an eye on the console for warnings; fix missing items or invalid data before continuing play.
- If migrating from older Dark Heresy builds, open a player character sheet once to let derived values recompute with the new defaults.

## Safe Upgrade Tips
- Test upgrades on a copy of your world first, especially if you have custom macros or third-party modules that rely on actor types.
- Ensure your Foundry VTT server is on v13 (the minimum supported version for this fork) before deploying to production tables.
- If actors behave unexpectedly after the upgrade, toggle the sheet to another type and back, then press **Save** to refresh cached data.
