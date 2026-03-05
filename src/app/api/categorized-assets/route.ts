import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

/** Spalten isin, rohstoff_art, direction, hebel_hoehe für die Auswertung */
export interface CategorizedAssetRow {
  id: string;
  isin: string;
  rohstoff_art: string | null;
  direction: string | null;
  hebel_hoehe: string | null;
}

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert." },
        { status: 503 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("categorized_assets")
      .select("id, isin, rohstoff_art, direction, hebel_hoehe")
      .order("rohstoff_art", { ascending: true });

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "Tabelle 'categorized_assets' existiert nicht." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("categorized-assets error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}
