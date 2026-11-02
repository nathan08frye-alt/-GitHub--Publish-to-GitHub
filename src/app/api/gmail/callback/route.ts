import {
  connection,
  NextRequest,
  NextResponse,
} from "next/server";

import {
  adminDatabase,
  decryptToken,
  emailSettings,
  encryptToken,
} from "@/lib/email-server";

export async function GET(request: NextRequest) {
  await connection();

  const settings = emailSettings();

  function finish(result: string) {
    const url = new URL("/", settings.appUrl);
    url.searchParams.set("gmail", result);

    const response = NextResponse.redirect(url);

    response.cookies.set("gmail_oauth", "", {
      httpOnly: true,
      secure: settings.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/api/gmail",
      maxAge: 0,
    });

    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");

    return response;
  }

  let stage = "checking connection request";

  try {
    const cookie = request.cookies.get("gmail_oauth")?.value;
    const state = request.nextUrl.searchParams.get("state");

    if (!cookie || !state) {
      console.error("Gmail callback: missing cookie or state.");
      return finish("invalid");
    }

    const saved = JSON.parse(
      decryptToken(cookie, "oauth", "gmail")
    );

    if (
      !saved ||
      typeof saved.userId !== "string" ||
      typeof saved.state !== "string" ||
      typeof saved.expiresAt !== "number" ||
      saved.state !== state ||
      saved.expiresAt < Date.now()
    ) {
      console.error(
        "Gmail callback: invalid or expired request."
      );
      return finish("invalid");
    }

    if (request.nextUrl.searchParams.has("error")) {
      console.error(
        "Gmail callback: Google authorization declined."
      );
      return finish("cancelled");
    }

    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      console.error(
        "Gmail callback: missing authorization code."
      );
      return finish("invalid");
    }

    stage = "exchanging Google authorization code";

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri,
          grant_type: "authorization_code",
          code,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!tokenResponse.ok) {
      const failure = await tokenResponse
        .json()
        .catch(() => null);

      console.error(
        "Google token exchange failed:",
        tokenResponse.status,
        typeof failure?.error === "string"
          ? failure.error
          : "Unknown Google error"
      );

      return finish("failed");
    }

    const tokens = await tokenResponse.json();

    if (
      typeof tokens.access_token !== "string" ||
      typeof tokens.refresh_token !== "string"
    ) {
      console.error(
        "Gmail callback: Google did not return both required tokens."
      );
      return finish("failed");
    }

    const scopes =
      typeof tokens.scope === "string"
        ? tokens.scope.split(" ")
        : [];

    if (
      !scopes.includes(
        "https://www.googleapis.com/auth/gmail.send"
      )
    ) {
      console.error(
        "Gmail callback: sending permission missing."
      );
      return finish("permission");
    }

    stage = "checking Google account identity";

    const identityResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!identityResponse.ok) {
      console.error(
        "Google account lookup failed:",
        identityResponse.status
      );
      return finish("failed");
    }

    const identity = await identityResponse.json();

    if (
      typeof identity.email !== "string" ||
      identity.email_verified !== true
    ) {
      console.error(
        "Gmail callback: verified email address missing."
      );
      return finish("failed");
    }

    stage = "encrypting Gmail connection";

    const encryptedRefreshToken = encryptToken(
      tokens.refresh_token,
      saved.userId,
      "gmail"
    );

    stage = "saving Gmail connection";

    const { error } = await adminDatabase()
      .from("email_connections")
      .upsert(
        {
          user_id: saved.userId,
          provider: "gmail",
          email_address: identity.email,
          encrypted_refresh_token: encryptedRefreshToken,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" }
      );

    if (error) {
      console.error(
        "Saving Gmail connection failed:",
        error.code,
        error.message
      );
      return finish("failed");
    }

    return finish("connected");
  } catch (error) {
    console.error(
      "Gmail callback failed during:",
      stage,
      "Error type:",
      error instanceof Error ? error.name : "Unknown"
    );

    return finish("failed");
  }
}