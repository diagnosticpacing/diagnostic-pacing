import { NextResponse } from "next/server";
import {
  createAdminSession,
  verifyAdminPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: unknown };
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!password || !(await verifyAdminPassword(password))) {
      return NextResponse.json(
        {
          error: "invalid_credentials",
          message: "The password was not accepted.",
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }

    await createAdminSession();

    return NextResponse.json(
      { authenticated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin login failed.", error);

    return NextResponse.json(
      {
        error: "authentication_unavailable",
        message: "Administrator authentication is temporarily unavailable.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
