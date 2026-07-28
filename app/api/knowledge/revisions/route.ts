import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { listKnowledgeRevisions, serializeKnowledgeError } from "@/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "unauthorized", message: "Administrator authentication is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return NextResponse.json(await listKnowledgeRevisions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
