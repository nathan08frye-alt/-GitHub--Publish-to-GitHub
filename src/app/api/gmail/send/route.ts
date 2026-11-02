import { NextResponse } from "next/server";
import {
  adminDatabase,
  authenticatedUser,
  decryptToken,
  emailSettings,
  hasValidOrigin,
} from "@/lib/email-server";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(data: object, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      value
    )
  );
}

export async function POST(request: Request) {
  let claimedId: string | null = null;
  let ownerId: string | null = null;
  let sendStarted = false;
  let accepted = false;

  try {
    if (!hasValidOrigin(request)) {
      return reply({ error: "Invalid request origin." }, 403);
    }

    const user = await authenticatedUser(request);

    if (!user) {
      return reply({ error: "Please log in again." }, 401);
    }

    ownerId = user.id;

    const payload = await request.json().catch(() => null);

    if (
      !payload ||
      typeof payload.requestId !== "string" ||
      !uuid.test(payload.requestId) ||
      typeof payload.estimateId !== "string" ||
      !uuid.test(payload.estimateId) ||
      typeof payload.recipient !== "string" ||
      typeof payload.subject !== "string" ||
      typeof payload.body !== "string"
    ) {
      return reply({ error: "Invalid email details." }, 400);
    }

    const recipient = payload.recipient.trim();
    const subject = payload.subject.trim();
    const body = payload.body.trim();

    if (
      !validEmail(recipient) ||
      !subject ||
      subject.length > 200 ||
      /[\r\n]/.test(subject) ||
      !body ||
      body.length > 20000
    ) {
      return reply(
        { error: "Check the recipient, subject, and message." },
        400
      );
    }

    const db = adminDatabase();

    const { data: estimate, error: estimateError } = await db
      .from("estimates")
      .select("id,customer_email")
      .eq("id", payload.estimateId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (estimateError) throw estimateError;

    if (!estimate) {
      return reply({ error: "Estimate not found." }, 404);
    }

    if (estimate.customer_email.trim() !== recipient) {
      return reply(
        {
          error:
            "The customer email changed. Refresh and review the recipient.",
        },
        409
      );
    }

    const { data: connection, error: connectionError } = await db
      .from("email_connections")
      .select("email_address,encrypted_refresh_token")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();

    if (connectionError) throw connectionError;

    if (!connection) {
      return reply({ error: "Connect Gmail first." }, 409);
    }

    if (!validEmail(connection.email_address)) {
      return reply({ error: "Reconnect your Gmail account." }, 409);
    }

    const settings = emailSettings();

    const refreshToken = decryptToken(
      connection.encrypted_refresh_token,
      user.id,
      "gmail"
    );

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!tokenResponse.ok) {
      return reply(
        {
          error:
            "Gmail authorization failed. Reconnect Gmail and try again.",
        },
        409
      );
    }

    const tokens = await tokenResponse.json();

    if (typeof tokens.access_token !== "string") {
      return reply({ error: "Could not authorize Gmail." }, 502);
    }

    const encodedSubject = Buffer.from(subject, "utf8")
      .toString("base64")
      .match(/.{1,48}/g)!
      .map((part) => `=?UTF-8?B?${part}?=`)
      .join("\r\n ");

    const encodedBody = Buffer.from(
      body.replace(/\r\n|\r|\n/g, "\r\n"),
      "utf8"
    )
      .toString("base64")
      .match(/.{1,76}/g)!
      .join("\r\n");

    const message = [
      `From: ${connection.email_address}`,
      `To: ${recipient}`,
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      encodedBody,
    ].join("\r\n");

    const { error: claimError } = await db
      .from("email_sends")
      .insert({
        id: payload.requestId,
        user_id: user.id,
        estimate_id: estimate.id,
        provider: "gmail",
        recipient,
        subject,
        status: "pending",
      });

    if (claimError) {
      if (claimError.code === "23505") {
        return reply(
          {
            error:
              "This send attempt was already recorded. Check Gmail Sent before trying another send.",
          },
          409
        );
      }

      throw claimError;
    }

    claimedId = payload.requestId;
    sendStarted = true;

    const sendResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: Buffer.from(message, "utf8").toString("base64url"),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!sendResponse.ok) {
      const uncertain = sendResponse.status >= 500;

      await db
        .from("email_sends")
        .update({ status: uncertain ? "unknown" : "failed" })
        .eq("id", claimedId)
        .eq("user_id", user.id);

      return reply(
        {
          error: uncertain
            ? "Gmail could not confirm the result. Check Gmail Sent before sending again."
            : "Gmail rejected the email. Check your Gmail connection and sending permissions.",
        },
        502
      );
    }

    accepted = true;

    const result = await sendResponse.json().catch(() => null);

    const { error: historyError } = await db
      .from("email_sends")
      .update({
        status: "sent",
        provider_message_id:
          typeof result?.id === "string" ? result.id : null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", claimedId)
      .eq("user_id", user.id);

    return reply({
      sent: true,
      warning: historyError
        ? "Gmail accepted the email, but its history could not be updated. Do not send it again."
        : null,
    });
  } catch {
    if (claimedId && ownerId && sendStarted) {
      try {
        await adminDatabase()
          .from("email_sends")
          .update({ status: accepted ? "sent" : "unknown" })
          .eq("id", claimedId)
          .eq("user_id", ownerId);
      } catch {
        // Keep the original attempt recorded; never resend here.
      }
    }

    if (accepted) {
      return reply({
        sent: true,
        warning:
          "Gmail accepted the email, but history could not be confirmed. Do not send it again.",
      });
    }

    return reply(
      {
        error: sendStarted
          ? "The send result is uncertain. Check Gmail Sent before sending again."
          : "Could not prepare the email. No email was sent.",
      },
      502
    );
  }
}