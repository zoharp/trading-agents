import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'market-data-cache.json');
const CACHE_TTL_MS = 3600000; // 1 hour

interface CacheEntry {
  symbol: string;
  data: TechnicalSnapshot;
  fetchedAt: number;
}

interface CacheIndex {
  [symbol: string]: CacheEntry;
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function loadCache(): CacheIndex {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const content = fs.readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveCache(cache: CacheIndex) {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    // Silently fail if we can't write cache
  }
}

function getCachedData(symbol: string): TechnicalSnapshot | null {
  const cache = loadCache();
  const entry = cache[symbol.toUpperCase()];
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAt;
  if (age < CACHE_TTL_MS) {
    return entry.data; // Cache is fresh (< 1 hour)
  }
  return null;
}

function updateCache(symbol: string, data: TechnicalSnapshot) {
  const cache = loadCache();
  cache[symbol.toUpperCase()] = {
    symbol: symbol.toUpperCase(),
    data,
    fetchedAt: Date.now(),
  };
  saveCache(cache);
}

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

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export async function getTechnicalSnapshot(symbol: string): Promise<TechnicalSnapshot> {
  // Check cache first
  const cached = getCachedData(symbol);
  if (cached) {
    return cached;
  }

  const end = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - 1);

  let result: any;
  try {
    const period1 = Math.floor(start.getTime() / 1000);
    const period2 = Math.floor(end.getTime() / 1000);
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${period1}&period2=${period2}`;

    const response = await withTimeout(fetch(chartUrl), 25000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    result = data.chart.result?.[0];

    if (!result || !result.timestamp) {
      throw new Error('No data returned from Yahoo Finance');
    }
  } catch (e) {
    // API call failed - try to use stale cache as fallback
    const cache = loadCache();
    const staleEntry = cache[symbol.toUpperCase()];
    if (staleEntry) {
      return staleEntry.data;
    }
    throw new Error(`Failed to fetch ${symbol} and no cached data available: ${(e as Error).message}`);
  }

  // Parse the new API format
  const timestamps = result.timestamp || [];
  const quote = result.indicators.quote[0] || {};
  const closes = quote.close || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const volumes = quote.volume || [];

  // Filter out nulls
  const validIndices = closes.map((_: any, i: number) => i).filter((i: number) => closes[i] != null);
  const filteredCloses = validIndices.map((i: number) => closes[i]);
  const filteredHighs = validIndices.map((i: number) => highs[i]);
  const filteredLows = validIndices.map((i: number) => lows[i]);
  const filteredVolumes = validIndices.map((i: number) => volumes[i]);

  const price = filteredCloses[filteredCloses.length - 1];
  const prev = filteredCloses[filteredCloses.length - 2] || price;
  const changePct = prev ? ((price - prev) / prev) * 100 : 0;

  const e20 = ema(filteredCloses, 20);
  const ema20 = e20[e20.length - 1];
  const sma50 = sma(filteredCloses, 50);
  const sma200 = sma(filteredCloses, 200);
  const rsi14 = rsi(filteredCloses);
  const macdVals = macd(filteredCloses);

  const last20 = filteredCloses.slice(-20);
  const mid = last20.reduce((a: number, b: number) => a + b, 0) / 20;
  const sd = stddev(last20);
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const pctB = (price - lower) / (upper - lower);

  const atr14 = atr(filteredHighs, filteredLows, filteredCloses);

  const high52w = Math.max(...filteredCloses);
  const low52w = Math.min(...filteredCloses);
  const avgVolume = sma(filteredVolumes, 20);

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

  // Build candles from the filtered data
  const opens = result.indicators.quote[0]?.open || [];
  const filteredOpens = validIndices.map((i: number) => opens[i]);
  const recentCandles = filteredCloses.slice(-10).map((close: number, idx: number) => {
    const dataIdx = filteredCloses.length - 10 + idx;
    const timestamp = timestamps[validIndices[dataIdx]];
    return {
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      o: filteredOpens[dataIdx] as number,
      h: filteredHighs[dataIdx] as number,
      l: filteredLows[dataIdx] as number,
      c: close as number,
      v: filteredVolumes[dataIdx] as number,
    };
  });

  const snapshot: TechnicalSnapshot = {
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

  // Update cache with fresh data
  updateCache(symbol, snapshot);

  return snapshot;
}

// Extract tickers from a free-text request: $TICKER or 1-5 uppercase letters
export function extractTickers(text: string): string[] {
  const dollarTickers = Array.from(text.matchAll(/\$([A-Z]{1,5})\b/g)).map(m => m[1]);
  const bareTickers = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g)).map(m => m[1]);
  const stopwords = new Set(['I', 'A', 'THE', 'AND', 'OR', 'BUT', 'IF', 'IT', 'IS', 'TO', 'FOR', 'AT', 'IN', 'ON', 'BUY', 'SELL', 'HOLD', 'LONG', 'SHORT', 'STOP', 'TP', 'SL', 'USD', 'EUR']);
  const all = [...dollarTickers, ...bareTickers.filter(t => !stopwords.has(t))];
  return Array.from(new Set(all));
}
