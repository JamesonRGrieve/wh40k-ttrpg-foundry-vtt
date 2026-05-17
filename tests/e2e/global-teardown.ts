export default async function globalTeardown(): Promise<void> {
    // The data-test/ dir is intentionally left in place between runs so
    // Foundry's LevelDB caches survive — speeds up subsequent boots and
    // matches how a contributor would re-run the suite locally. Wipe it
    // manually if a regression demands a clean slate:
    //
    //   rm -rf .foundry-release/data-test
}
