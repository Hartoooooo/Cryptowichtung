import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export interface SnapshotCoin {
  name: string;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  pct: number;
}

export interface SnapshotPositionTrade {
  side: "B" | "S";
  trandattim?: string;
  instmnem: string;
  instshtnam: string;
  betrag: number;
  ordrqty?: number;
  price?: number;
  etpLabel: string;
}

export interface SnapshotPosition {
  iban: string;
  tickerDisplay: string;
  nameDisplay: string;
  count: number;
  buyAmount: number;
  sellAmount: number;
  gesamt: number;
  etpLabel: string;
  trades?: SnapshotPositionTrade[];
}

export interface SnapshotCategorizedTrade {
  side: "B" | "S";
  trandattim?: string;
  instmnem: string;
  instshtnam: string;
  betrag: number;
  ordrqty?: number;
  price?: number;
}

export interface SnapshotCategorizedPosition {
  positionKey: string;
  tickerDisplay: string;
  nameDisplay: string;
  direction: string;
  hebelHoehe: string;
  tradesCount: number;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  trades: SnapshotCategorizedTrade[];
}

export interface SnapshotCategorizedAsset {
  name: string;
  direction: string | null;
  hebelHoehe: string;
  positionsCount: number;
  tradesCount: number;
  buyAmount: number;
  sellAmount: number;
  totalAmount: number;
  positions: SnapshotCategorizedPosition[];
}

export interface Snapshot {
  id: string;
  snapshot_date: string;
  label: string | null;
  coins: SnapshotCoin[];
  positions?: SnapshotPosition[] | null;
  categorized_assets?: SnapshotCategorizedAsset[] | null;
  created_at: string;
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase nicht konfiguriert." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("portfolio_snapshots")
    .select("id, snapshot_date, label, coins, positions, categorized_assets, created_at")
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
  const { snapshot_date, label, coins, positions, categorized_assets } = body;

  if (!snapshot_date) {
    return NextResponse.json({ error: "snapshot_date ist erforderlich." }, { status: 400 });
  }
  const coinsList = Array.isArray(coins) ? coins : [];
  const catAssets = Array.isArray(categorized_assets) ? categorized_assets : [];
  if (coinsList.length === 0 && catAssets.length === 0) {
    return NextResponse.json({ error: "coins oder categorized_assets mit mindestens einem Eintrag erforderlich." }, { status: 400 });
  }

  const insertData: Record<string, unknown> = {
    snapshot_date,
    label: label ?? null,
    coins: coinsList,
  };
  if (Array.isArray(positions) && positions.length > 0) {
    insertData.positions = positions;
  }
  if (catAssets.length > 0) {
    insertData.categorized_assets = catAssets;
  }

  const { data, error } = await supabaseAdmin
    .from("portfolio_snapshots")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
