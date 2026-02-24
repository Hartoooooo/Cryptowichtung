import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { error } = await supabaseAdmin!
      .from("IsinCache")
      .select("id")
      .limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        message: e instanceof Error ? e.message : "DB-Verbindung fehlgeschlagen",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
