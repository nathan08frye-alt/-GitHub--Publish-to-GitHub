"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error("Please log out and log in again.");
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

export default function GmailConnection() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const url = new URL(window.location.href);
    const result = url.searchParams.get("gmail");

    if (result) {
      const messages: Record<string, string> = {
        connected: "Gmail connected successfully.",
        cancelled: "Gmail connection was cancelled.",
        permission: "Allow the send-email permission, then try again.",
        invalid: "Connection expired or was invalid. Please try again.",
        failed: "Gmail connection failed. Check the server settings.",
      };

      setMessage(messages[result] ?? "Please try connecting again.");
      url.searchParams.delete("gmail");
      window.history.replaceState(null, "", url.toString());
    }

    async function load() {
      try {
        const response = await fetch("/api/gmail/connect", {
          headers: await authHeaders(),
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not check Gmail.");
        }

        if (active) setEmail(result.email);
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error ? error.message : "Could not check Gmail."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: await authHeaders(),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not connect Gmail.");
      }

      window.location.assign(result.url);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not connect Gmail."
      );
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Email connection</h2>
          <p className="mt-1 break-words text-sm text-slate-500">
            {loading
              ? "Checking Gmail..."
              : email
                ? `Connected inbox: ${email}`
                : "Connect the Gmail inbox you use for customer follow-ups."}
          </p>
        </div>

        <button
          disabled={loading || busy}
          onClick={() => void connect()}
          className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Connecting..." : email ? "Reconnect Gmail" : "Connect Gmail"}
        </button>
      </div>

      {message && (
        <p role="status" className="mt-4 text-sm text-indigo-700">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Connecting does not send any email. Sending will be added next.
      </p>
    </section>
  );
}