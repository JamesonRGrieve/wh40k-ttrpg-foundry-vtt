import { HooksManager } from './hooks-manager.mjs';
import { HandlebarManager } from './handlebars/handlebars-manager.mjs';

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
HooksManager.registerHooks();
HandlebarManager.registerHelpers();
