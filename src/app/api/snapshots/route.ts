import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export interface SnapshotCoin {
  name: string;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  pct: number;
}

export interface Snapshot {
  id: string;
  snapshot_date: string;
  label: string | null;
  coins: SnapshotCoin[];
  created_at: string;
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("portfolio_snapshots")
    .select("id, snapshot_date, label, coins, created_at")
    .order("snapshot_date", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json(
        { error: "Tabelle 'portfolio_snapshots' existiert nicht. Bitte SQL-Migration ausführen." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });
  }

  const body = await req.json();
  const { snapshot_date, label, coins } = body;

  if (!snapshot_date || !Array.isArray(coins) || coins.length === 0) {
    return NextResponse.json({ error: "snapshot_date und coins sind erforderlich." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("portfolio_snapshots")
    .insert({ snapshot_date, label: label ?? null, coins })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
