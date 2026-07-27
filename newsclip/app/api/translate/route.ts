import { NextRequest, NextResponse } from "next/server";
import { translateToKorean } from "@/lib/ai";

// POST /api/translate — 텍스트 한국어 번역
export async function POST(req: NextRequest) {
  try {
    const { text, articleId } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "text 필요" }, { status: 400 });
    }

    const translated = await translateToKorean(text);

    return NextResponse.json({ translated, articleId });
  } catch (err) {
    console.error("[POST /api/translate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
