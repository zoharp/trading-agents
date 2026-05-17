import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const costFile = path.join(process.cwd(), '.cache', 'debate-costs.json');
    if (!fs.existsSync(costFile)) {
      return NextResponse.json({ costs: [] });
    }
    const costs = JSON.parse(fs.readFileSync(costFile, 'utf-8'));
    return NextResponse.json({ costs });
  } catch (e) {
    return NextResponse.json({ costs: [], error: (e as Error).message }, { status: 500 });
  }
}
