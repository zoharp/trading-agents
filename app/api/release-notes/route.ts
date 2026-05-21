import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  const file = path.join(process.cwd(), 'release_notes.json');
  const notes = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return NextResponse.json(notes);
}
