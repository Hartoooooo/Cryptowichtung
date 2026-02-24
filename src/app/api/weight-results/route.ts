import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert." },
        { status: 503 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("weight_results")
      .select("id, isin, name, constituents, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "Tabelle 'weight_results' existiert nicht." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("weight-results error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}
