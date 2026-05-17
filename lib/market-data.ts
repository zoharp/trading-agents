import * as yf from 'yahoo-finance2';

const yahooFinance = yf as any;

export interface TechnicalSnapshot {
  symbol: string;
  asOf: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
  ema20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  macd: { macd: number; signal: number; hist: number };
  bollinger: { upper: number; mid: number; lower: number; pctB: number };
  atr14: number;
  recentCandles: { date: string; o: number; h: number; l: number; c: number; v: number }[];
  regime: string;
  trendStructure: string;
}

// --- helpers ---
const ema = (arr: number[], period: number): number[] => {
  const k = 2 / (period + 1);
  const out: number[] = [];
  arr.forEach((v, i) => {
    if (i === 0) out.push(v);
    else out.push(v * k + out[i - 1] * (1 - k));
  });
  return out;
};
const sma = (arr: number[], period: number): number => {
  if (arr.length < period) return NaN;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
};
const stddev = (arr: number[]): number => {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
};
const rsi = (closes: number[], period = 14): number => {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
};
const macd = (closes: number[]) => {
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line, 9);
  const last = line.length - 1;
  return { macd: line[last], signal: sig[last], hist: line[last] - sig[last] };
};
const atr = (highs: number[], lows: number[], closes: number[], period = 14): number => {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return sma(trs, period);
};

export async function getTechnicalSnapshot(symbol: string): Promise<TechnicalSnapshot> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);

  const result = (await yahooFinance.chart(symbol, {
    period1: start,
    period2: end,
    interval: '1d',
  })) as any;

  const quotes = result.quotes.filter((q: any) => q.close != null);
  const closes = quotes.map((q: any) => q.close as number);
  const highs = quotes.map((q: any) => q.high as number);
  const lows = quotes.map((q: any) => q.low as number);
  const volumes = quotes.map((q: any) => q.volume as number);

  const price = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const changePct = ((price - prev) / prev) * 100;

  const e20 = ema(closes, 20);
  const ema20 = e20[e20.length - 1];
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const rsi14 = rsi(closes);
  const macdVals = macd(closes);

  const last20 = closes.slice(-20);
  const mid = last20.reduce((a: number, b: number) => a + b, 0) / 20;
  const sd = stddev(last20);
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const pctB = (price - lower) / (upper - lower);

  const atr14 = atr(highs, lows, closes);

  const high52w = Math.max(...closes);
  const low52w = Math.min(...closes);
  const avgVolume = sma(volumes, 20);

  // Regime & structure
  let regime = 'mixed';
  if (price > sma200 && sma50 > sma200) regime = 'bull (above 200 SMA, 50>200)';
  else if (price < sma200 && sma50 < sma200) regime = 'bear (below 200 SMA, 50<200)';
  else if (price > sma200) regime = 'bullish but mixed (above 200 SMA)';
  else regime = 'bearish but mixed (below 200 SMA)';

  // Recent structure - look at last 20 bars for HH/HL
  const recent = closes.slice(-20);
  const firstHalfHigh = Math.max(...recent.slice(0, 10));
  const secondHalfHigh = Math.max(...recent.slice(10));
  const firstHalfLow = Math.min(...recent.slice(0, 10));
  const secondHalfLow = Math.min(...recent.slice(10));
  let trendStructure = 'choppy';
  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) trendStructure = 'higher highs, higher lows (uptrend)';
  else if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) trendStructure = 'lower highs, lower lows (downtrend)';

  const recentCandles = quotes.slice(-10).map((q: any) => ({
    date: (q.date instanceof Date ? q.date : new Date(q.date)).toISOString().split('T')[0],
    o: q.open as number,
    h: q.high as number,
    l: q.low as number,
    c: q.close as number,
    v: q.volume as number,
  }));

  return {
    symbol: symbol.toUpperCase(),
    asOf: new Date().toISOString().split('T')[0],
    price: +price.toFixed(2),
    changePct: +changePct.toFixed(2),
    volume: volumes[volumes.length - 1],
    avgVolume: Math.round(avgVolume),
    high52w: +high52w.toFixed(2),
    low52w: +low52w.toFixed(2),
    ema20: +ema20.toFixed(2),
    sma50: +sma50.toFixed(2),
    sma200: +sma200.toFixed(2),
    rsi14: +rsi14.toFixed(1),
    macd: { macd: +macdVals.macd.toFixed(3), signal: +macdVals.signal.toFixed(3), hist: +macdVals.hist.toFixed(3) },
    bollinger: { upper: +upper.toFixed(2), mid: +mid.toFixed(2), lower: +lower.toFixed(2), pctB: +pctB.toFixed(2) },
    atr14: +atr14.toFixed(2),
    recentCandles,
    regime,
    trendStructure,
  };
}

// Extract tickers from a free-text request: $TICKER or 1-5 uppercase letters
export function extractTickers(text: string): string[] {
  const dollarTickers = Array.from(text.matchAll(/\$([A-Z]{1,5})\b/g)).map(m => m[1]);
  const bareTickers = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g)).map(m => m[1]);
  const stopwords = new Set(['I', 'A', 'THE', 'AND', 'OR', 'BUT', 'IF', 'IT', 'IS', 'TO', 'FOR', 'AT', 'IN', 'ON', 'BUY', 'SELL', 'HOLD', 'LONG', 'SHORT', 'STOP', 'TP', 'SL', 'USD', 'EUR']);
  const all = [...dollarTickers, ...bareTickers.filter(t => !stopwords.has(t))];
  return Array.from(new Set(all));
}
