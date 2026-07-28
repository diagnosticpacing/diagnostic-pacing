import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      marker: "admin-auth-diagnostic-v3",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
      environment: process.env.VERCEL_ENV ?? "unknown",
      adminPasswordHashConfigured: Boolean(
        process.env.ADMIN_PASSWORD_HASH,
      ),
      sessionSecretConfigured: Boolean(
        process.env.SESSION_SECRET,
      ),
      sessionSecretLength:
        process.env.SESSION_SECRET?.length ?? 0,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
