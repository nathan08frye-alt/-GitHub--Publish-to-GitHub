"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  estimate: {
    id: string;
    customer: string;
    project: string;
    customer_email: string;
  };
};

export default function EmailComposer({ estimate }: Props) {
  const firstName = estimate.customer.trim().split(/\s+/)[0];

  const [subject, setSubject] = useState(
    `Following up on your ${estimate.project} estimate`
  );

  const [body, setBody] = useState(
    `Hi ${firstName},\n\nI wanted to check in on the ${estimate.project} estimate. Do you have any questions about the scope or pricing?\n\nHappy to talk through the next steps whenever you are ready.`
  );

  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const lock = useRef(false);
  const requestId = useRef<string | null>(null);

  const input =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 disabled:opacity-60";

  async function sendEmail() {
    if (lock.current || attempted || sent) return;

    setError("");
    setMessage("");

    if (!estimate.customer_email.trim()) {
      setError("Add the customer's email using Edit details first.");
      return;
    }

    if (!subject.trim() || !body.trim()) {
      setError("Enter a subject and message.");
      return;
    }

    const confirmed = window.confirm(
      `Send this email to ${estimate.customer_email} from your connected Gmail account?`
    );

    if (!confirmed) return;

    lock.current = true;
    setBusy(true);

    let submitted = false;

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !data.session) {
        throw new Error("Please log in again.");
      }

      requestId.current ??= crypto.randomUUID();

      submitted = true;
      setAttempted(true);

      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: requestId.current,
          estimateId: estimate.id,
          recipient: estimate.customer_email.trim(),
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      const result = await response.json().catch(() => null);

      if (!result) {
        throw new Error(
          "Could not confirm the result. Check Gmail Sent before sending again."
        );
      }

      if (!response.ok || result.sent !== true) {
        throw new Error(result.error || "Could not send the email.");
      }

      setSent(true);
      setMessage(
        result.warning ||
          "Gmail accepted your email. You can find it in Gmail Sent."
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : submitted
            ? "Could not confirm the result. Check Gmail Sent before sending again."
            : "Could not prepare the email."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-indigo-700">
          SEND FOLLOW-UP EMAIL
        </p>

        <p className="mt-2 break-words text-sm text-slate-600">
          To: {estimate.customer_email || "No customer email added"}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          From your connected Gmail account.
        </p>
      </div>

      <label className="block space-y-2 text-sm font-medium">
        <span>Subject</span>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={200}
          disabled={busy || attempted}
          className={input}
        />
      </label>

      <label className="block space-y-2 text-sm font-medium">
        <span>Message</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={20000}
          rows={8}
          disabled={busy || attempted}
          className={input}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={() => void sendEmail()}
        disabled={
          busy ||
          attempted ||
          !estimate.customer_email.trim() ||
          !subject.trim() ||
          !body.trim()
        }
        className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy
          ? "Sending..."
          : sent
            ? "Email sent"
            : attempted
              ? "Send attempt recorded"
              : "Send email"}
      </button>

      <p className="text-xs text-slate-500">
        Sending does not change the follow-up date. Use “Followed up”
        after a successful send to schedule the next follow-up.
      </p>
    </div>
  );
}