// Loads the single symbol config shared with the browser (R43): public/interface/backtest/js/bt-symbols.js.
// The file is an IIFE whose footer uses globalThis, so a side-effect ESM import sets globalThis.WwBtSymbols.
import '../../../public/interface/backtest/js/bt-symbols.js';
import { UsageError } from './args.mjs';

export function loadSymbols() {
  const S = globalThis.WwBtSymbols;
  if (!S) throw new UsageError('bt-symbols.js did not register WwBtSymbols');
  const errs = S.validate();
  if (errs.length) throw new UsageError('bt-symbols.js is invalid:\n  ' + errs.join('\n  '));
  return S;
}
