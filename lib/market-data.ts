import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'market-data-cache.json');

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
  } catch {
    // Silently fail
  }
}

function updateCache(symbol: string, data: TechnicalSnapshot) {
  const cache = loadCache();
  cache[symbol.toUpperCase()] = { symbol: symbol.toUpperCase(), data, fetchedAt: Date.now() };
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
  obv: number;
  obvTrend: 'rising' | 'falling';
  cmf: number;
  accumulationScore: number;
  recentCandles: { date: string; o: number; h: number; l: number; c: number; v: number }[];
  regime: string;
  trendStructure: string;

  // From slow_data (stock-predictor cache) — optional, present when data is available
  earningsDate?: string;
  earningsDaysAway?: number;
  earningsSoon?: boolean;

  analystTarget?: number;
  analystLow?: number;
  analystHigh?: number;
  analystRecommendation?: string;
  analystCount?: number;
  peRatio?: number;
  cashDebtRatio?: number;
  cashDebtLabel?: string;
  sector?: string;
  sectorEtf?: string;

  putCallRatio?: number;
  putCallLabel?: string;

  shortPct?: number;
  shortLabel?: string;

  insiderSignal?: string;
  insiderDetail?: string;

  googleTrendsCurrent?: number;
  googleTrendsChange?: number;
  googleTrendsLabel?: string;

  stockReturn30d?: number;
  spyReturn30d?: number;
  alphaVsSpy?: number;

  trendDirection?: string;

  industryAlpha?: number;
  industryEtfName?: string;

  support20d?: number;
  resistance20d?: number;
  safeStrike?: number;
}

// --- price indicator helpers ---
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
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
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
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
};
const macd = (closes: number[]) => {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const sig = ema(line, 9);
  const last = line.length - 1;
  return { macd: line[last], signal: sig[last], hist: line[last] - sig[last] };
};
const atr = (highs: number[], lows: number[], closes: number[], period = 14): number => {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  return sma(trs, period);
};
const calcObv = (closes: number[], volumes: number[]): number[] => {
  const out = [0];
  for (let i = 1; i < closes.length; i++) {
    const dir = closes[i] > closes[i - 1] ? 1 : closes[i] < closes[i - 1] ? -1 : 0;
    out.push(out[i - 1] + dir * volumes[i]);
  }
  return out;
};
const calcCmf = (highs: number[], lows: number[], closes: number[], volumes: number[], period = 20): number => {
  if (closes.length < period) return NaN;
  let mfv = 0, vol = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const range = highs[i] - lows[i];
    const mf = range > 0 ? ((closes[i] - lows[i]) - (highs[i] - closes[i])) / range : 0;
    mfv += mf * volumes[i];
    vol += volumes[i];
  }
  return vol > 0 ? mfv / vol : 0;
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function getSupabasePrices(symbol: string): Promise<any[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials missing in environment');

  const allRows: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = new URL(`${supabaseUrl}/rest/v1/prices`);
    url.searchParams.append('select', '*');
    url.searchParams.append('ticker', `eq.${symbol.toUpperCase()}`);
    url.searchParams.append('order', 'date');
    url.searchParams.append('offset', offset.toString());
    url.searchParams.append('limit', pageSize.toString());

    const response = await withTimeout(
      fetch(url.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      }),
      25000
    );
    if (!response.ok) throw new Error(`Supabase error: HTTP ${response.status}`);

    const rows = await response.json();
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

// Fetch all slow_data rows for a ticker (analyst, earnings, put/call, etc.)
async function getSlowData(symbol: string): Promise<Record<string, any>> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return {};

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/slow_data`);
    url.searchParams.append('select', 'call_name,payload');
    url.searchParams.append('ticker', `eq.${symbol.toUpperCase()}`);

    const response = await withTimeout(
      fetch(url.toString(), {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      }),
      10000
    );
    if (!response.ok) return {};

    const rows: { call_name: string; payload: any }[] = await response.json();
    const result: Record<string, any> = {};
    for (const row of rows) result[row.call_name] = row.payload;
    return result;
  } catch {
    return {};
  }
}

export async function getTechnicalSnapshot(symbol: string): Promise<TechnicalSnapshot> {
  // Always fetch live — cache only used as fallback if fetch fails
  let result: any;
  let slowData: Record<string, any> = {};

  try {
    // Fetch prices and slow_data in parallel
    const [rows, slow] = await Promise.all([
      getSupabasePrices(symbol),
      getSlowData(symbol),
    ]);

    if (!rows || rows.length === 0) throw new Error('No data returned from Supabase');
    slowData = slow;

    result = {
      timestamp: rows.map((r: any) => Math.floor(new Date(r.date).getTime() / 1000)),
      indicators: {
        quote: [{
          open: rows.map((r: any) => r.open),
          high: rows.map((r: any) => r.high),
          low: rows.map((r: any) => r.low),
          close: rows.map((r: any) => r.close),
          volume: rows.map((r: any) => r.volume),
        }],
      },
    };
  } catch (e) {
    const cache = loadCache();
    const staleEntry = cache[symbol.toUpperCase()];
    if (staleEntry) return staleEntry.data;
    throw new Error(`Failed to fetch ${symbol} and no cached data available: ${(e as Error).message}`);
  }

  const timestamps = result.timestamp || [];
  const quote = result.indicators.quote[0] || {};
  const closes = quote.close || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const volumes = quote.volume || [];
  const opens = quote.open || [];

  const validIndices = closes.map((_: any, i: number) => i).filter((i: number) => closes[i] != null);
  const filteredCloses = validIndices.map((i: number) => closes[i]);
  const filteredHighs = validIndices.map((i: number) => highs[i]);
  const filteredLows = validIndices.map((i: number) => lows[i]);
  const filteredVolumes = validIndices.map((i: number) => volumes[i]);
  const filteredOpens = validIndices.map((i: number) => opens[i]);

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

  // OBV and CMF
  const obvSeries = calcObv(filteredCloses, filteredVolumes);
  const obvCurrent = obvSeries[obvSeries.length - 1];
  const obvPast = obvSeries[Math.max(0, obvSeries.length - 20)];
  const obvTrend: 'rising' | 'falling' = obvCurrent >= obvPast ? 'rising' : 'falling';
  const cmf20 = calcCmf(filteredHighs, filteredLows, filteredCloses, filteredVolumes, 20);

  // Accumulation score: 60% OBV trend + 40% CMF
  const obvScore = obvTrend === 'rising' ? 100 : 0;
  const cmfScore = Math.max(0, Math.min(100, ((cmf20 + 1) / 2) * 100));
  const accumulationScore = Math.round(0.6 * obvScore + 0.4 * cmfScore);

  // Regime & trend structure
  let regime = 'mixed';
  if (price > sma200 && sma50 > sma200) regime = 'bull (above 200 SMA, 50>200)';
  else if (price < sma200 && sma50 < sma200) regime = 'bear (below 200 SMA, 50<200)';
  else if (price > sma200) regime = 'bullish but mixed (above 200 SMA)';
  else regime = 'bearish but mixed (below 200 SMA)';

  const recent = filteredCloses.slice(-20);
  const firstHalfHigh = Math.max(...recent.slice(0, 10));
  const secondHalfHigh = Math.max(...recent.slice(10));
  const firstHalfLow = Math.min(...recent.slice(0, 10));
  const secondHalfLow = Math.min(...recent.slice(10));
  let trendStructure = 'choppy';
  if (secondHalfHigh > firstHalfHigh && secondHalfLow > firstHalfLow) trendStructure = 'higher highs, higher lows (uptrend)';
  else if (secondHalfHigh < firstHalfHigh && secondHalfLow < firstHalfLow) trendStructure = 'lower highs, lower lows (downtrend)';

  const recentCandles = filteredCloses.slice(-10).map((c: number, idx: number) => {
    const dataIdx = filteredCloses.length - 10 + idx;
    const timestamp = timestamps[validIndices[dataIdx]];
    return {
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      o: filteredOpens[dataIdx] as number,
      h: filteredHighs[dataIdx] as number,
      l: filteredLows[dataIdx] as number,
      c,
      v: filteredVolumes[dataIdx] as number,
    };
  });

  // Extract slow_data fields
  const earn = slowData['earnings_flag'] || {};
  const analyst = slowData['analyst_data'] || {};
  const pcr = slowData['put_call_ratio'] || {};
  const si = slowData['short_interest'] || {};
  const insider = slowData['insider_transactions'] || {};
  const trends = slowData['google_trends'] || {};
  const relStr = slowData['relative_strength'] || {};
  const t18m = slowData['trend_18m'] || {};
  const industry = slowData['industry_chart'] || {};
  const supRes = slowData['support_resistance'] || {};

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
    obv: Math.round(obvCurrent),
    obvTrend,
    cmf: +cmf20.toFixed(3),
    accumulationScore,
    recentCandles,
    regime,
    trendStructure,

    // Earnings
    ...(earn.earnings_date !== undefined && { earningsDate: earn.earnings_date }),
    ...(earn.earnings_days_away !== undefined && { earningsDaysAway: earn.earnings_days_away }),
    ...(earn.earnings_soon !== undefined && { earningsSoon: earn.earnings_soon }),

    // Analyst / fundamentals
    ...(analyst.analyst_target !== undefined && { analystTarget: analyst.analyst_target }),
    ...(analyst.analyst_low !== undefined && { analystLow: analyst.analyst_low }),
    ...(analyst.analyst_high !== undefined && { analystHigh: analyst.analyst_high }),
    ...(analyst.analyst_recommendation !== undefined && { analystRecommendation: analyst.analyst_recommendation }),
    ...(analyst.analyst_count !== undefined && { analystCount: analyst.analyst_count }),
    ...(analyst.pe_ratio !== undefined && { peRatio: analyst.pe_ratio }),
    ...(analyst.cash_debt_ratio !== undefined && { cashDebtRatio: analyst.cash_debt_ratio }),
    ...(analyst.cash_debt_label !== undefined && { cashDebtLabel: analyst.cash_debt_label }),
    ...(analyst.sector !== undefined && { sector: analyst.sector }),
    ...(analyst.sector_etf !== undefined && { sectorEtf: analyst.sector_etf }),

    // Options / sentiment
    ...(pcr.put_call_ratio !== undefined && { putCallRatio: pcr.put_call_ratio }),
    ...(pcr.pcr_label !== undefined && { putCallLabel: pcr.pcr_label }),

    // Short interest
    ...(si.short_pct !== undefined && { shortPct: si.short_pct }),
    ...(si.short_label !== undefined && { shortLabel: si.short_label }),

    // Insider
    ...(insider.insider_signal !== undefined && { insiderSignal: insider.insider_signal }),
    ...(insider.insider_detail !== undefined && { insiderDetail: insider.insider_detail }),

    // Google Trends
    ...(trends.trends_current !== undefined && { googleTrendsCurrent: trends.trends_current }),
    ...(trends.trends_change !== undefined && { googleTrendsChange: trends.trends_change }),
    ...(trends.trends_label !== undefined && { googleTrendsLabel: trends.trends_label }),

    // Relative strength vs SPY
    ...(relStr.stock_return_30d !== undefined && { stockReturn30d: relStr.stock_return_30d }),
    ...(relStr.spy_return_30d !== undefined && { spyReturn30d: relStr.spy_return_30d }),
    ...(relStr.alpha !== undefined && { alphaVsSpy: relStr.alpha }),

    // 18-month trend direction
    ...(t18m.trend_direction !== undefined && { trendDirection: t18m.trend_direction }),

    // Industry alpha
    ...(industry.industry_alpha !== undefined && { industryAlpha: industry.industry_alpha }),
    ...(industry.industry_etf_name !== undefined && { industryEtfName: industry.industry_etf_name }),

    // Support / resistance
    ...(supRes.support_20d !== undefined && { support20d: supRes.support_20d }),
    ...(supRes.resistance_20d !== undefined && { resistance20d: supRes.resistance_20d }),
    ...(supRes.safe_strike !== undefined && { safeStrike: supRes.safe_strike }),
  };

  updateCache(symbol, snapshot);
  return snapshot;
}

export function extractTickers(text: string): string[] {
  const dollarTickers = Array.from(text.matchAll(/\$([A-Z]{1,5})\b/g)).map(m => m[1]);
  const bareTickers = Array.from(text.matchAll(/\b([A-Z]{2,5})\b/g)).map(m => m[1]);
  const stopwords = new Set([
    'I', 'A', 'THE', 'AND', 'OR', 'BUT', 'IF', 'IT', 'IS', 'TO', 'FOR', 'AT', 'IN', 'ON', 'MY', 'ME', 'WE',
    'BUY', 'SELL', 'HOLD', 'LONG', 'SHORT', 'STOP', 'TP', 'SL', 'ENTER', 'EXIT',
    'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'YTD', 'MTD', 'QTD', 'EOD', 'EOW',
    'CSP', 'CC', 'PMR', 'PCS', 'CCS', 'BPS', 'BCS', 'PMCC', 'IC', 'ICS', 'BWB', 'RWB',
    'PUT', 'CALL', 'ITM', 'OTM', 'ATM', 'DTE', 'IV', 'HV', 'RV', 'VIX', 'EXP',
    'SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'BB', 'OBV', 'CMF', 'MFI', 'ADX', 'ROC',
    'PM', 'AH', 'AM', 'NOW', 'NEW', 'OLD', 'HIGH', 'LOW', 'MID', 'MAX', 'MIN',
  ]);
  const all = [...dollarTickers, ...bareTickers.filter(t => !stopwords.has(t))];
  return Array.from(new Set(all));
}
