import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'no db config' }, { status: 500 });

  const url = new URL(`${supabaseUrl}/rest/v1/conclusions`);
  url.searchParams.append('select', 'ticker,date,conclusion');
  url.searchParams.append('ticker', `eq.${ticker.toUpperCase()}`);
  url.searchParams.append('limit', '1');

  const res = await fetch(url.toString(), {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });

  if (!res.ok) return NextResponse.json({ error: `db error ${res.status}` }, { status: 500 });

  const rows = await res.json();
  return NextResponse.json(rows?.[0] ?? {});
}
