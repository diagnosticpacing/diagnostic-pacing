import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { loadCurrentKnowledge, saveKnowledge, serializeKnowledgeError } from "@/knowledge/service";
import type { SaveKnowledgeRequest } from "@/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Administrator authentication is required." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return unauthorized();
  try {
    return NextResponse.json(await loadCurrentKnowledge(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return unauthorized();
  try {
    const payload = await request.json() as SaveKnowledgeRequest;
    return NextResponse.json(await saveKnowledge(payload), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
