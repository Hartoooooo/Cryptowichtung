import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await prisma.isinCache.findFirst({ take: 1 });
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
