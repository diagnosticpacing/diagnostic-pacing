import { NextResponse } from "next/server";
import { loadCurrentKnowledge, saveKnowledge, serializeKnowledgeError } from "@/knowledge/service";
import type { SaveKnowledgeRequest } from "@/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadCurrentKnowledge(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as SaveKnowledgeRequest;
    return NextResponse.json(await saveKnowledge(payload), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
