import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  adminDatabase,
  authenticatedUser,
  emailSettings,
  encryptToken,
  hasValidOrigin,
} from "@/lib/email-server";


export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 }
      );
    }

    const { data, error } = await adminDatabase()
      .from("email_connections")
      .select("email_address")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json(
      { email: data?.email_address ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not check your Gmail connection." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!hasValidOrigin(request)) {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 }
      );
    }

    const user = await authenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Please log in again." },
        { status: 401 }
      );
    }

    const settings = emailSettings();
    const state = randomBytes(32).toString("hex");

    const cookie = encryptToken(
      JSON.stringify({
        userId: user.id,
        state,
        expiresAt: Date.now() + 10 * 60 * 1000,
      }),
      "oauth",
      "gmail"
    );

    const url = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );

    url.search = new URLSearchParams({
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      response_type: "code",
      scope:
        "openid email https://www.googleapis.com/auth/gmail.send",
      access_type: "offline",
      prompt: "consent select_account",
      state,
    }).toString();

    const response = NextResponse.json(
      { url: url.toString() },
      { headers: { "Cache-Control": "no-store" } }
    );

    response.cookies.set("gmail_oauth", cookie, {
      httpOnly: true,
      secure: settings.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/api/gmail",
      maxAge: 600,
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not start Gmail connection. Check your server settings.",
      },
      { status: 500 }
    );
  }
}