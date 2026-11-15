// supabase/functions/_shared/emotions.ts
// Emotions in the trader's own notes: the tags the trade forms add (#korku, #fomo, #revenge ...; public/components/
// note-tools) and plain words in Turkish, English and German. Each closed trade gets the emotions found in its note; the
// coach then sees what each emotion costs. No model call. Pure (Node tests).
import { type TradeRow, stats, rMultiple } from './trade-summary.ts';

export const EMOTIONS = ['calm', 'confident', 'fear', 'greed', 'fomo', 'revenge', 'impatient', 'tired'] as const;
export type Emotion = typeof EMOTIONS[number];
export const POSITIVE: readonly Emotion[] = ['calm', 'confident'];

// word stems (matched at the start of a word, case-insensitive); the tags of every language are included
const WORDS: Record<Emotion, string[]> = {
  calm: ['sakin', 'rahat', 'calm', 'relaxed', 'ruhig', 'gelassen'],
  confident: ['re:emin(?:im|dim|di|dir)?(?![\\p{L}])', 'özgüven', 'confident', 'sicher', 'selbstbewusst'],
  fear: ['korku', 'kork', 'endişe', 'panik', 'tedirgin', 'fear', 'afraid', 'scared', 'nervous', 'panic', 'angst', 'nervös'],
  greed: ['açgözlü', 'hırs', 'greed', 'gier'],
  fomo: ['fomo', 'kaçırma', 'treni kaçır', 'missing out'],
  revenge: ['intikam', 'geri almak', 'geri alma', 'revenge', 'get it back', 'rache', 'zurückholen'],
  impatient: ['sabırsız', 'aceleci', 'acele', 'impatient', 'rushed', 'ungeduldig', 'hastig'],
  tired: ['yorgun', 'uykusuz', 'tired', 'exhausted', 'müde', 'erschöpft'],
};
// an entry 're:...' is a raw pattern; a word followed by "değil" or preceded by "not" / "nicht" / "kein" does not count
const NEG_AFTER = '(?!\\p{L}*\\s+değil)';
const RE: [Emotion, RegExp][] = EMOTIONS.map((e) => [e, new RegExp('(?:^|[^\\p{L}])(?<!(?:not|nicht|kein|keine|never)\\s+)#?(?:' + WORDS[e].map((w) =>
  w.startsWith('re:') ? w.slice(3) : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|') + ')' + NEG_AFTER, 'iu')]);

// "Korkuyla girdim #fomo" -> ['fear', 'fomo']
export function emotionsOf(note: unknown): Emotion[] {
  const raw = String(note ?? '');
  if (!raw.trim()) return [];
  // Turkish lowercasing turns I into ı ("INTIKAM" -> "ıntıkam"): try both forms
  const a = raw.toLocaleLowerCase('tr'), b = raw.toLowerCase();
  return RE.filter(([, re]) => re.test(a) || re.test(b)).map(([e]) => e);
}

// closed live trades -> what each emotion costs; null when fewer than 3 trades carry an emotion
export function emotionStats(closed: TradeRow[]) {
  const tagged = closed.map((t) => ({ t, e: emotionsOf(t.notes) })).filter((x) => x.e.length);
  if (tagged.length < 3) return null;
  const by = EMOTIONS.map((e) => {
    const list = tagged.filter((x) => x.e.includes(e)).map((x) => x.t);
    if (!list.length) return null;
    const rs = list.map(rMultiple).filter((v): v is number => v != null);
    return { key: e, positive: POSITIVE.includes(e), ...stats(list), avg_r: rs.length >= 3 ? Math.round(rs.reduce((s, x) => s + x, 0) / rs.length * 100) / 100 : null };
  }).filter(Boolean) as any[];
  const untagged = closed.filter((t) => !emotionsOf(t.notes).length);
  return {
    trades_with_emotion: tagged.length, share_pct: Math.round(tagged.length / closed.length * 1000) / 10,
    by_emotion: by.sort((a, b) => b.trades - a.trades),
    without_emotion: stats(untagged),
  };
}
