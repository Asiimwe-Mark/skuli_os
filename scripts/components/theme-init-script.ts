/**
 * Inline script that runs BEFORE React hydration to apply the stored
 * theme class to <html>. This eliminates the flash-of-wrong-theme.
 *
 * IMPORTANT: This file is server-only and contains a stable string
 * constant - do NOT move it into a "use client" file. Importing a
 * client-module string into the root layout and then re-rendering
 * that string on the client (as React 19 does for hydration) causes
 * a hydration mismatch when the module's lexical environment is
 * re-evaluated client-side (e.g. the `${STORAGE_KEY}` interpolation
 * can produce different whitespace or different output if the module
 * is bundled differently on the client). Keep this constant in a
 * plain server-renderable module so server and client agree on the
 * exact same string.
 */
export const THEME_STORAGE_KEY = "skuli-theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t==="dark"){document.documentElement.classList.add("dark");}else{document.documentElement.classList.remove("dark");}document.documentElement.style.colorScheme=t;}catch(e){}})();`;
