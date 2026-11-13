# Fonts

The system ships these fonts so that no client has to reach Google Fonts to
render a sheet (#709). Their `@font-face` rules are in `tailwind/fonts.js`.
Each licence is in `licenses/`.

| Font | Files | Licence | Source |
| --- | --- | --- | --- |
| Cinzel, © 2020 The Cinzel Project Authors | `cinzel-400-latin.woff2`, `cinzel-400-latin-ext.woff2` | SIL Open Font License 1.1 (`licenses/Cinzel-OFL.txt`) | Google Fonts, latin and latin-ext subsets, weight 400 |
| IM Fell DW Pica, © 2010 Igino Marini | `im-fell-dw-pica-400-latin.woff2` | SIL Open Font License 1.1 (`licenses/IMFellDWPica-OFL.txt`) | Google Fonts, latin subset |
| Lusitana, © 2011 Ana Paula Megda, Reserved Font Name "Lusitana" | `Lusitana-Regular.ttf` | SIL Open Font License 1.1 (`licenses/Lusitana-OFL.txt`) | the original files from the google/fonts repository, unmodified |
| Roboto, © 2011 The Roboto Project Authors | `roboto-latin.woff2`, `roboto-latin-ext.woff2` | SIL Open Font License 1.1 (`licenses/Roboto-OFL.txt`) | Google Fonts, latin and latin-ext subsets |
| Material Icons, © Google | `material-icons.woff2` | Apache License 2.0 (`licenses/MaterialIcons-Apache-2.0.txt`) | Google Fonts, complete font |

Lusitana ships unmodified because its licence reserves the name "Lusitana".
The OFL treats a subset or format conversion as a modified version, which
could not keep that name.

Cinzel and Lusitana ship at weight 400 only, as the system has always loaded
them; their bold is the browser's synthetic bold.

Material Icons ships complete because templates take some icon names from data
(tab strips, toggles), so a subset could silently miss one.
