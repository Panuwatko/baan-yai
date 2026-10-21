// localStorage wrappers; every access is guarded because private mode or blocked storage can throw.
const KEY = { game: "baanyai.game", found: "baanyai.endings", prefs: "baanyai.prefs", album: "baanyai.album" };
export const SAVE_VERSION = 5;

function get(key, fallback){
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function set(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

export function loadGame(){
  const S = get(KEY.game, null);
  return S && S.v === SAVE_VERSION ? S : null;
}
export const saveGame = S => set(KEY.game, S);
export function clearGame(){ try { localStorage.removeItem(KEY.game); } catch (e) {} }

export const found = () => get(KEY.found, []);
export function addFound(key){
  const f = found();
  if (!f.includes(key)) { f.push(key); set(KEY.found, f); }
}

export const loadPrefs = () => ({ jump: true, sound: true, ...get(KEY.prefs, {}) });
export const savePrefs = p => set(KEY.prefs, p);

// The trip album: small windshield snapshots taken at each decision. Kept apart from the game
// save so the frequent saves stay small.
export const loadAlbum = () => get(KEY.album, []);
export function addToAlbum(entry){ const a = loadAlbum(); a.push(entry); set(KEY.album, a); }
export function clearAlbum(){ try { localStorage.removeItem(KEY.album); } catch (e) {} }
