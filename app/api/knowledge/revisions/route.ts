import { NextResponse } from "next/server";
import { listKnowledgeRevisions, serializeKnowledgeError } from "@/knowledge/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await listKnowledgeRevisions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
