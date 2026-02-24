import { runWorkflow } from "@/lib/workflow";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const isin = body?.isin;
    const productName = typeof body?.productName === "string" ? body.productName.trim() : undefined;
    if (!isin || typeof isin !== "string") {
      return NextResponse.json(
        { error: "Parameter 'isin' fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    const result = await runWorkflow(isin, productName);

    if ("code" in result && "message" in result) {
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          httpStatus: result.httpStatus,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("API weights error:", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Interner Serverfehler",
      },
      { status: 500 }
    );
  }
}
