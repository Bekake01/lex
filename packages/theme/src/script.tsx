/** localStorage key for an explicit choice; no value = follow the system setting. */
export const THEME_KEY = 'lex-theme';

// Runs before the first paint: sets <html data-theme="light|dark">, follows the
// system setting until the user picks one, and syncs a choice made in another tab.
const script = `(function(){var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');function s(){var t=null;try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}d.dataset.theme=t==='light'||t==='dark'?t:m.matches?'dark':'light'}s();m.addEventListener('change',s);addEventListener('storage',function(e){if(e.key==='${THEME_KEY}')s()})})()`;

/** Put inside <head> of the root layout, and add suppressHydrationWarning to <html>. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
