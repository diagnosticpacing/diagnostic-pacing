import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { restoreKnowledge, serializeKnowledgeError } from "@/knowledge/service";
import type { RestoreKnowledgeRequest } from "@/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { error: "unauthorized", message: "Administrator authentication is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const payload = await request.json() as RestoreKnowledgeRequest;
    return NextResponse.json(await restoreKnowledge(payload), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = serializeKnowledgeError(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}
