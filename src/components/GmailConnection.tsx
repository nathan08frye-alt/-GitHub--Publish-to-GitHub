"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const messages: Record<string, string> = {
  connected: "Gmail connected successfully.",
  cancelled: "Gmail connection was cancelled.",
  permission: "Please allow permission to send email, then try again.",
  invalid: "The connection request expired. Please try again.",
  failed: "Gmail connection failed. Check the server settings.",
};

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error("Please log in again.");
  }

  return {
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

export default function GmailConnection() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const callbackResult = useRef<string | null>(null);
  const connectLock = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const url = new URL(window.location.href);
    const result = url.searchParams.get("gmail");

    if (result) {
      callbackResult.current = result;
      url.searchParams.delete("gmail");
      window.history.replaceState(null, "", url.toString());
    }

    async function load() {
      try {
        const headers = await authHeaders();

        if (!active) return;

        if (callbackResult.current) {
          setMessage(
            messages[callbackResult.current] ??
              "Please try connecting again."
          );
        }

        const response = await fetch("/api/gmail/connect", {
          headers,
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data) {
          throw new Error(
            data?.error || "Could not check your Gmail connection."
          );
        }

        if (active) {
          setEmail(
            typeof data.email === "string" ? data.email : null
          );
        }
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not check your Gmail connection."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function connect() {
    if (connectLock.current) return;

    connectLock.current = true;
    setConnecting(true);
    setError("");
    setMessage("");

    try {
      const headers = await authHeaders();

      const response = await fetch("/api/gmail/connect", {
        method: "POST",
        headers,
      });

      const data = await response.json().catch(() => null);

      if (
        !response.ok ||
        typeof data?.url !== "string"
      ) {
        throw new Error(
          data?.error || "Could not start the Gmail connection."
        );
      }

      window.location.assign(data.url);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not start the Gmail connection."
      );

      connectLock.current = false;
      setConnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">
            Email connection
          </h2>

          <p className="mt-1 break-words text-sm text-slate-500">
            {loading
              ? "Checking your Gmail connection..."
              : email
                ? `Connected inbox: ${email}`
                : "Connect the Gmail inbox you use for customer follow-ups."}
          </p>
        </div>

        <button
          type="button"
          disabled={loading || connecting}
          onClick={() => void connect()}
          className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {connecting
            ? "Opening Google..."
            : email
              ? "Reconnect Gmail"
              : "Connect Gmail"}
        </button>
      </div>

      {message && (
        <p
          role="status"
          className="mt-4 text-sm text-indigo-700"
        >
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Send emails from an estimate’s Open follow-up panel.
      </p>
    </section>
  );
}