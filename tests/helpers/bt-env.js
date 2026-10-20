// Loads the Backtest v2 libraries into a fresh vm context, the way the browser runs them
// (plain scripts that attach to window). Usage: const { S, C, E } = loadBt(['symbols', 'candles', 'engine']);
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DIR = path.resolve('public/interface/backtest/js');
const FILES = {
  symbols: 'bt-symbols.js', candles: 'bt-candles.js', engine: 'bt-engine.js', synthetic: 'bt-synthetic.js',
  data: 'bt-data.js', store: 'bt-store.js'
};

export function loadBt(names, extra = {}) {
  const win = Object.assign({
    Intl, Date, Math, Number, String, Array, Object, RegExp, JSON, isNaN, isFinite, parseInt, parseFloat,
    BigInt, Float64Array, Int32Array, Promise, Error, Uint8Array, setTimeout, clearTimeout, Symbol, Map, Set
  }, extra);
  win.window = win;
  win.globalThis = win;
  vm.createContext(win);
  for (const n of names) vm.runInContext(fs.readFileSync(path.join(DIR, FILES[n]), 'utf8'), win, { filename: FILES[n] });
  return {
    win, S: win.WwBtSymbols, C: win.WwBtCandles, E: win.WwBtEngine, Y: win.WwBtSynthetic,
    D: win.WwBtData, Store: win.WwBtStore, Gate: win.WwBtGate
  };
}

// minute-column helper for candle tests: rows [t,o,h,l,c] in points -> Minutes
export function minutes(C, rows) { return C.toMinutes(rows, 0, { points: true }); }

// objects created inside the vm context have the context's prototypes: compare them as plain JSON
export const plain = (x) => JSON.parse(JSON.stringify(x));
