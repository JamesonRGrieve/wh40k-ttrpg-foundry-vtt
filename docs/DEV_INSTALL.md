# Local Development Install

## Prereqs

- Node.js and npm installed.
- Foundry VTT installed locally (v12 compatible).

## Setup (Linux/macOS)

1) Install dependencies

```bash
npm install
```

2) Build assets (SCSS + packs)

```bash
npm run build
```

3) Symlink the built system into Foundry Data

Replace `<FoundryData>` with your local Foundry Data path.

```bash
ln -s /home/aqui/RogueTraderVTT/build/rogue-trader <FoundryData>/systems/rogue-trader
```

4) Optional: watch for changes

```bash
npm run watch
```

## Setup (Windows, PowerShell)

```powershell
npm install
npm run build
New-Item -ItemType SymbolicLink -Path "<FoundryData>\systems\rogue-trader" -Target "C:\path\to\RogueTraderVTT\build\rogue-trader"
```

## Testing in Foundry

- Launch Foundry and create a world using the "Rogue Trader" system.
- Open the browser console (F12) and check for errors during system load.
- Open an Actor sheet (Acolyte or Character) and verify:
  - fields render,
  - roll buttons open prompts,
  - chat cards appear.

## Notes

- The system currently loads from `build/rogue-trader/`. If you symlink `src/` directly, you must also compile SCSS into a `css/` folder under the symlinked path.
- When updating the system id or build folder name, update the symlink target path accordingly.

## Using the Official PDF as the Actor Sheet (Foundry v13)

1) Put the PDF somewhere Foundry can serve

Common, tidy places:

- `Data/worlds/<your-world>/assets/rt/` (world-local)
- or if you’re making an add-on module later: `Data/modules/<your-module>/assets/`

(Do not put it in a public GitHub repo unless you’re 100% sure you have redistribution rights.)

2) Install a PDF-as-sheet module

Pick one:

- PDF Sheets (easy)
- PDF Pager (mapping + macros)

Install via Add-on Modules in Foundry, enable in your world.

3) Apply the PDF sheet to an Actor

For either module:

- Open an Actor
- In the Actor window header, click Sheet
- Choose PDF Sheet
- Save/reopen if prompted

4) Select the PDF file

- PDF Sheets: use the PDF button in the sheet header to pick the file
- PDF Pager: configure “same PDF for actor type” in module settings, and optionally set a Custom PDF per actor

5) Set it as the default sheet (optional)

If you want every new Character actor to open as the PDF by default:

- Foundry Settings → Core Settings → Configure Default Sheets
- Pick “PDF Sheet” for the actor type

6) Permissions (so players can use it)

PDF selection/upload uses Foundry’s file browser permissions:

- “Use File Browser” to pick PDFs already on the server
- “Upload Files” to upload their own PDFs

Most groups keep upload restricted to GM and just assign PDFs for players.
