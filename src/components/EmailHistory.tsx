"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type EmailSend = {
  id: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "unknown";
  created_at: string;
  sent_at: string | null;
};

const labels = {
  pending: "Awaiting confirmation — check Gmail Sent",
  sent: "Accepted by Gmail",
  failed: "Send failed",
  unknown: "Result uncertain — check Gmail Sent",
};

export default function EmailHistory({
  estimateId,
}: {
  estimateId: string;
}) {
  const [items, setItems] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data, error } = await supabase
          .from("email_sends")
          .select(
            "id,recipient,subject,status,created_at,sent_at"
          )
          .eq("estimate_id", estimateId)
          .order("created_at", { ascending: false })
          .limit(50)
          .abortSignal(controller.signal);

        if (error) throw error;

        if (active) {
          setItems((data ?? []) as EmailSend[]);
        }
      } catch {
        if (active) {
          setError("Could not load email history. Try refreshing.");
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
  }, [estimateId, refresh]);

  return (
    <div className="mt-6 border-t border-indigo-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Email history
        </h3>

        <button
          type="button"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
          className="text-sm font-semibold text-indigo-600 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh history"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : loading ? (
        <p className="mt-3 text-sm text-slate-500">
          Loading email history...
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No email attempts recorded for this estimate.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="break-words text-sm font-semibold">
                {item.subject}
              </p>

              <p className="mt-1 break-words text-sm text-slate-500">
                To: {item.recipient}
              </p>

              <p
                className={`mt-2 text-xs font-semibold ${
                  item.status === "sent"
                    ? "text-emerald-700"
                    : item.status === "failed"
                      ? "text-red-700"
                      : "text-amber-700"
                }`}
              >
                {labels[item.status]}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {new Date(
                  item.sent_at ?? item.created_at
                ).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-500">
        Shows the latest 50 attempts. Gmail acceptance does not
        confirm delivery or that the customer read the email.
      </p>
    </div>
  );
}