import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert. Prüfe .env." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { isin, name, constituents } = body;

    if (!isin || typeof isin !== "string" || !name || typeof name !== "string") {
      return NextResponse.json(
        { error: "Parameter 'isin' und 'name' erforderlich" },
        { status: 400 }
      );
    }

    if (!Array.isArray(constituents)) {
      return NextResponse.json(
        { error: "Parameter 'constituents' muss ein Array sein" },
        { status: 400 }
      );
    }

    const normalizedIsin = isin.trim().toUpperCase();

    const { data: existing } = await supabaseAdmin
      .from("weight_results")
      .select("id")
      .eq("isin", normalizedIsin)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from("weight_results")
        .update({
          name: String(name).trim(),
          constituents: constituents,
        })
        .eq("isin", normalizedIsin);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, updated: true });
    }

    const { data, error } = await supabaseAdmin
      .from("weight_results")
      .insert({
        isin: normalizedIsin,
        name: String(name).trim(),
        constituents: constituents,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "Tabelle 'weight_results' existiert nicht. Führe supabase-migration.sql aus." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    console.error("save-weight error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Interner Fehler" },
      { status: 500 }
    );
  }
}
