import { NextRequest, NextResponse } from "next/server";
import { humanize } from "@/lib/humanize";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (text.length > 20000) {
      return NextResponse.json(
        { error: "텍스트는 20,000자 이내로 입력해주세요." },
        { status: 400 }
      );
    }

    const result = humanize(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
