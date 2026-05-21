import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ costs: [] });
  }

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/debate_costs`);
    url.searchParams.set('order', 'timestamp.desc');
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!res.ok) return NextResponse.json({ costs: [] });

    const rows = await res.json();
    const costs = rows.map((r: any) => ({
      timestamp: r.timestamp,
      ticker: r.ticker,
      rounds: r.rounds,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costUsd: r.cost_usd,
      model: r.model,
    }));

    return NextResponse.json({ costs });
  } catch (e) {
    return NextResponse.json({ costs: [], error: (e as Error).message }, { status: 500 });
  }
}
