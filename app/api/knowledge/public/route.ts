import { NextResponse } from "next/server";
import { loadCurrentKnowledge, serializeKnowledgeError } from "@/knowledge/service";

// Unauthenticated on purpose: the knowledge base is clinical reference
// content (maneuver/diagnosis/reasoning definitions), not patient data, and
// the public workspace GUI needs to read it to render maneuver cards, the
// differential diagnosis engine, etc. Only the admin editor's GET/POST at
// /api/knowledge requires authentication, since that path can write.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await loadCurrentKnowledge();
    return NextResponse.json(
      { revision: snapshot.revision, sheets: snapshot.workbook.sheets },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
