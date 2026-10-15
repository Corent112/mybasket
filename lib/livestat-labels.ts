/** Labels carried by new highlight identities; historical SQL keys are never rewritten. */
const PREFIX = 'cw1:';
const LEGACY_LABELS: Record<string, string> = {
  pick_side:'Pick Side', pick_top:'Pick Top', pick_non_porteur:'Pick non porteur',
  one_vs_one:'1v1', hand_off:'Hand Off', drive_kick:'Drive & Kick',
  jeu_sans_ballon:'Jeu sans ballon', passing:'Passing', rebond_offensif:'Rebond offensif', autres:'Autres',
  'pick-side':'Pick Side', 'pick-top':'Pick Top', 'hand-off':'Hand Off', 'drive-kick':'Drive & kick',
  'fast-break':'Fast Break', transition:'Transition', 'jeu-place':'Jeu placé', '1v1':'1v1',
  stagger:'Stagger', 'jeu-sans-ballon':'Jeu sans ballon', 'off-rebound':'Offensive Rebound',
};
export function readHighlightIdentity(key: string | null | undefined): { base: string; label: string } | null {
  if (!key?.startsWith(PREFIX)) return null;
  const parts=key.slice(PREFIX.length).split(':');
  if(parts.length!==2)return null;
  try { const base=decodeURIComponent(parts[0]),label=decodeURIComponent(parts[1]);return base&&label?{base,label}:null; } catch { return null; }
}
export function highlightBaseKey(key: string) { const base=readHighlightIdentity(key)?.base??key;return ({'pick-side':'pick_side','pick-top':'pick_top'} as Record<string,string>)[base]??base; }
export function highlightLabel(key: string | null | undefined): string {
  if(!key)return '';
  return readHighlightIdentity(key)?.label ?? LEGACY_LABELS[key] ?? key;
}
export function versionedHighlightKey(key: string, label: string): string {
  const value=label.trim()||'Sans nom',identity=readHighlightIdentity(key);
  const base=identity?.base??key;
  if(LEGACY_LABELS[base]===value)return base;
  return `${PREFIX}${encodeURIComponent(base)}:${encodeURIComponent(value)}`;
}
