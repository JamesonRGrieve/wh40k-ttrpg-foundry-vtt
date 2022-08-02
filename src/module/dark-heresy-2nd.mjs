import { HooksManager } from './hooks.mjs';
import { HandlebarManager } from './handlebars.mjs';

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
HooksManager.registerHooks();
HandlebarManager.registerHelpers();
