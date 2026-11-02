"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import GmailConnection from "@/components/GmailConnection";
import EmailComposer from "@/components/EmailComposer";
import EmailHistory from "@/components/EmailHistory";

type Status = "Waiting" | "Booked" | "Lost" | "closed";

type Estimate = {
  id: string;
  customer: string;
  project: string;
  amount: number;
  status: Status;
  follow_up_date: string;
  last_contact_date: string | null;
  customer_email: string;
  customer_phone: string;
  notes: string;
};

type Details = Pick<
  Estimate,
  | "customer"
  | "project"
  | "amount"
  | "follow_up_date"
  | "customer_email"
  | "customer_phone"
  | "notes"
>;

const fields =
  "id,customer,project,amount,status,follow_up_date,last_contact_date,customer_email,customer_phone,notes";

const input =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

const primary =
  "rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";

const secondary =
  "rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

function dateString(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + days);
  return dateString(date);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);

  return (
    year >= 1000 &&
    year <= 9999 &&
    dateString(new Date(year, month - 1, day, 12)) === value
  );
}

function niceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function formDetails(form: HTMLFormElement): Details {
  const data = new FormData(form);

  const details: Details = {
    customer: String(data.get("customer") ?? "").trim(),
    project: String(data.get("project") ?? "").trim(),
    amount: Number(data.get("amount")),
    follow_up_date: String(data.get("date") ?? ""),
    customer_email: String(data.get("email") ?? "").trim(),
    customer_phone: String(data.get("phone") ?? "").trim(),
    notes: String(data.get("notes") ?? "").trim(),
  };

  if (
    !details.customer ||
    details.customer.length > 100 ||
    !details.project ||
    details.project.length > 200 ||
    !Number.isFinite(details.amount) ||
    details.amount <= 0 ||
    details.amount > 1000000000 ||
    !validDate(details.follow_up_date) ||
    details.customer_email.length > 254 ||
    details.customer_phone.length > 50 ||
    details.notes.length > 5000
  ) {
    throw new Error("Check the customer, project, amount, and date.");
  }

  if (
    details.customer_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.customer_email)
  ) {
    throw new Error("Enter a valid customer email address.");
  }

  return details;
}

function DetailFields({
  estimate,
  today,
}: {
  estimate?: Estimate;
  today: string;
}) {
  return (
    <>
      <label className="space-y-2 text-sm font-medium">
        <span>Customer name</span>
        <input
          name="customer"
          defaultValue={estimate?.customer ?? ""}
          maxLength={100}
          required
          className={input}
          placeholder="Customer name"
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Project</span>
        <input
          name="project"
          defaultValue={estimate?.project ?? ""}
          maxLength={200}
          required
          className={input}
          placeholder="Project description"
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Customer email · optional</span>
        <input
          name="email"
          type="email"
          defaultValue={estimate?.customer_email ?? ""}
          maxLength={254}
          className={input}
          placeholder="customer@example.com"
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Phone number · optional</span>
        <input
          name="phone"
          type="tel"
          defaultValue={estimate?.customer_phone ?? ""}
          maxLength={50}
          className={input}
          placeholder="Phone number"
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Estimate amount ($)</span>
        <input
          name="amount"
          type="number"
          defaultValue={estimate?.amount ?? ""}
          min="0.01"
          max="1000000000"
          step="0.01"
          required
          className={input}
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        <span>Follow-up date</span>
        <input
          name="date"
          type="date"
          defaultValue={estimate?.follow_up_date ?? today}
          min="1000-01-01"
          max="9999-12-31"
          required
          className={input}
        />
      </label>

      <label className="space-y-2 text-sm font-medium sm:col-span-2">
        <span>Notes · optional</span>
        <textarea
          name="notes"
          defaultValue={estimate?.notes ?? ""}
          maxLength={5000}
          rows={3}
          className={input}
          placeholder="Preferences, questions, or details to remember..."
        />
      </label>
    </>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const authLock = useRef(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setReady(true);
      }
    );

    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-slate-50 p-10 text-slate-600">
        Loading your workspace...
      </main>
    );
  }

  if (user) return <Dashboard key={user.id} user={user} />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8">
        <div className="text-2xl font-bold">
          FollowUp<span className="text-indigo-600">.</span>
        </div>

        <h1 className="mt-8 text-2xl font-bold">
          {signup ? "Create your workspace" : "Welcome back"}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Keep your estimates and follow-ups in one place.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (authLock.current) return;

            const data = new FormData(event.currentTarget);
            const email = String(data.get("email") ?? "").trim();
            const password = String(data.get("password") ?? "");

            authLock.current = true;
            setBusy(true);
            setError("");
            setMessage("");

            try {
              if (signup) {
                const { data: result, error } =
                  await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                      emailRedirectTo: window.location.origin,
                    },
                  });

                if (error) throw error;

                if (!result.session) {
                  setMessage(
                    "Check your email for a confirmation link. After confirming, return here to log in."
                  );
                }
              } else {
                const { error } =
                  await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });

                if (error) throw error;
              }
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              authLock.current = false;
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>Email</span>
            <input
              className={input}
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block space-y-2 text-sm font-medium">
            <span>Password</span>
            <input
              className={input}
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 12 : undefined}
              required
            />
          </label>

          {signup && (
            <p className="text-xs text-slate-500">
              Use a unique password with at least 12 characters.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {message && (
            <p role="status" className="text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button disabled={busy} className={`${primary} w-full`}>
            {busy ? "Please wait..." : signup ? "Create account" : "Log in"}
          </button>
        </form>

        <button
          type="button"
          disabled={busy}
          className="mt-5 text-sm font-semibold text-indigo-600"
          onClick={() => {
            setSignup(!signup);
            setError("");
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}

function Dashboard({ user }: { user: User }) {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [reload, setReload] = useState(0);

  const mounted = useRef(false);
  const mutationLock = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let active = true;

    function refreshDate() {
      setToday(dateString());
    }

    refreshDate();
    const timer = window.setInterval(refreshDate, 30000);
    window.addEventListener("focus", refreshDate);

    async function load() {
      setLoading(true);
      setLoadFailed(false);
      setError("");

      try {
        const { data, error } = await supabase
          .from("estimates")
          .select(fields)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal);

        if (error) throw error;

        if (active) {
          setEstimates((data ?? []) as Estimate[]);
        }
      } catch (error) {
        if (active) {
          setError(errorMessage(error));
          setLoadFailed(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      mounted.current = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
    };
  }, [user.id, reload]);

  async function mutate(action: () => Promise<void>) {
    if (mutationLock.current) return;

    mutationLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function saveChanges(
    id: string,
    changes: Partial<
      Details & Pick<Estimate, "status" | "last_contact_date">
    >
  ) {
    const { data, error } = await supabase
      .from("estimates")
      .update(changes)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(fields)
      .single();

    if (error) throw error;

    if (mounted.current) {
      setEstimates((current) =>
        current.map((item) =>
          item.id === id ? (data as Estimate) : item
        )
      );
    }
  }

  function followedUp(item: Estimate) {
    void mutate(async () => {
      const contacted = dateString();

      await saveChanges(item.id, {
        last_contact_date: contacted,
        follow_up_date: addDays(contacted, 3),
      });

      if (mounted.current) {
        setNotice(
          "Follow-up recorded. Next follow-up scheduled in 3 days."
        );
      }
    });
  }

  const waiting = estimates.filter((item) => item.status === "Waiting");
  const booked = estimates.filter((item) => item.status === "Booked");

  const due = waiting
    .filter((item) => today && item.follow_up_date <= today)
    .sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date));

  const visible = estimates.filter(
    (item) =>
      (filter === "All" || item.status === filter) &&
      [
        item.customer,
        item.project,
        item.customer_email,
        item.customer_phone,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  const selected = estimates.find((item) => item.id === selectedId);
  const editing = estimates.find((item) => item.id === editingId);

  const stats = [
    { label: "Follow-ups due", value: String(due.length) },
    { label: "Waiting for a decision", value: String(waiting.length) },
    {
      label: "Open estimate value",
      value: money(
        waiting.reduce((sum, item) => sum + Number(item.amount), 0)
      ),
    },
    {
      label: "Booked estimate value",
      value: money(
        booked.reduce((sum, item) => sum + Number(item.amount), 0)
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="text-xl font-bold">
            FollowUp<span className="text-indigo-600">.</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm text-slate-500">{user.email}</span>
            <button
              type="button"
              disabled={busy}
              className="text-sm font-semibold text-indigo-600 disabled:opacity-50"
              onClick={() =>
                void mutate(async () => {
                  const { error } = await supabase.auth.signOut();
                  if (error) throw error;
                })
              }
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section>
          <p className="text-sm font-semibold text-indigo-600">
            YOUR SALES WORKSPACE
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Keep your next job moving.
          </h1>
          <p className="mt-2 text-slate-500">
            Customer details, estimates, and follow-ups in one place.
          </p>
          {today && (
            <p className="mt-3 text-sm text-slate-400">
              {niceDate(today)}
            </p>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            <p>{error}</p>
            {loadFailed && (
              <button
                type="button"
                disabled={loading || busy}
                onClick={() => setReload((value) => value + 1)}
                className="mt-3 font-semibold underline"
              >
                Retry loading estimates
              </button>
            )}
          </div>
        )}

        {notice && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}

        <GmailConnection />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-bold">
                {loading || loadFailed ? "—" : stat.value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Follow-up hub</h2>
          <p className="mt-1 text-sm text-slate-500">
            Waiting estimates due today or overdue.
          </p>

          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="text-sm text-slate-500">
                Loading estimates...
              </p>
            ) : loadFailed ? (
              <p className="text-sm text-slate-500">
                Estimates could not be loaded. Please retry above.
              </p>
            ) : due.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
                No follow-ups due right now.
              </p>
            ) : (
              due.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{item.customer}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.project} · {money(Number(item.amount))}
                    </p>

                    <div className="mt-2 space-y-1 break-words text-sm text-slate-500">
                      {item.customer_email && <p>{item.customer_email}</p>}
                      {item.customer_phone && <p>{item.customer_phone}</p>}
                    </div>

                    <p
                      className={`mt-2 text-xs font-medium ${
                        item.follow_up_date < today
                          ? "text-red-600"
                          : "text-amber-700"
                      }`}
                    >
                      {item.follow_up_date < today ? "Overdue" : "Due today"}
                      {" · "}
                      {niceDate(item.follow_up_date)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={secondary}
                    >
                      Open follow-up
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => followedUp(item)}
                      className={primary}
                    >
                      Followed up
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400">
            “Followed up” records today and schedules another follow-up
            in 3 days. It does not send a message.
          </p>
        </section>

        {selected && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                Follow-up for {selected.customer}
              </h2>

              <div className="flex gap-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingId(selected.id)}
                  className="text-sm font-semibold text-indigo-700"
                >
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-sm font-semibold text-indigo-700"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 rounded-xl bg-white/70 p-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">
                  EMAIL
                </p>
                <p className="mt-1 break-words">
                  {selected.customer_email || "No email added"}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500">
                  PHONE
                </p>
                <p className="mt-1">
                  {selected.customer_phone || "No phone added"}
                </p>
              </div>

              {selected.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-slate-500">
                    CUSTOMER NOTES
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    {selected.notes}
                  </p>
                </div>
              )}
            </div>

            <EmailComposer
              key={`${selected.id}:${selected.customer_email}`}
              estimate={selected}
            />

            <EmailHistory
              key={selected.id}
              estimateId={selected.id}
            />
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Add an estimate</h2>
          <p className="mt-1 text-sm text-slate-500">
            Contact details are optional and can be added later.
          </p>

          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || loading || loadFailed) return;

              const form = event.currentTarget;
              let details: Details;

              try {
                details = formDetails(form);
              } catch (error) {
                setError(errorMessage(error));
                return;
              }

              void mutate(async () => {
                const { data, error } = await supabase
                  .from("estimates")
                  .insert({
                    ...details,
                    user_id: user.id,
                    status: "Waiting",
                  })
                  .select(fields)
                  .single();

                if (error) throw error;

                if (mounted.current) {
                  setEstimates((current) => [
                    data as Estimate,
                    ...current,
                  ]);
                  setNotice("Estimate and contact details saved.");
                  form.reset();
                }
              });
            }}
          >
            <fieldset
              disabled={busy || loading || loadFailed}
              className="grid gap-4 disabled:opacity-50 sm:grid-cols-2"
            >
              <DetailFields key={today} today={today} />
              <button className={`${primary} sm:col-span-2`}>
                {busy ? "Please wait..." : "Add estimate"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 p-6 lg:flex-row lg:items-center">
            <h2 className="text-lg font-semibold">All estimates</h2>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                aria-label="Search estimates"
                placeholder="Search name, project, email, phone..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={input}
              />
              <select
                aria-label="Filter by status"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className={input}
              >
                <option value="All">All statuses</option>
                <option>Waiting</option>
                <option>Booked</option>
                <option>Lost</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {[
                    "Customer / project",
                    "Contact",
                    "Estimate",
                    "Status",
                    "Next follow-up",
                    "Last follow-up",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="whitespace-nowrap px-6 py-4"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {!loading &&
                  !loadFailed &&
                  visible.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100"
                    >
                      <td className="min-w-48 px-6 py-5">
                        <p className="font-semibold">{item.customer}</p>
                        <p className="mt-1 text-slate-500">
                          {item.project}
                        </p>
                      </td>

                      <td className="min-w-48 px-6 py-5 text-slate-500">
                        <p className="break-words">
                          {item.customer_email || "No email"}
                        </p>
                        <p className="mt-1">
                          {item.customer_phone || "No phone"}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 font-semibold">
                        {money(Number(item.amount))}
                      </td>

                      <td className="px-6 py-5">
                        <select
                          disabled={busy}
                          aria-label={`Status for ${item.customer}`}
                          value={item.status}
                          onChange={(event) => {
                            const status = event.target.value as Status;

                            void mutate(async () => {
                              await saveChanges(item.id, { status });
                              if (mounted.current) {
                                setNotice("Status updated and saved.");
                              }
                            });
                          }}
                          className="rounded-lg border border-slate-300 bg-white p-2"
                        >
                          <option>Waiting</option>
                          <option>Booked</option>
                          <option>Lost</option>
                        </select>
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-slate-500">
                        {item.status === "Waiting"
                          ? niceDate(item.follow_up_date)
                          : "Not scheduled"}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-slate-500">
                        {item.last_contact_date
                          ? niceDate(item.last_contact_date)
                          : "Not recorded"}
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex flex-col items-start gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditingId(item.id)}
                            className="whitespace-nowrap font-semibold text-indigo-600"
                          >
                            Edit details
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className="whitespace-nowrap text-xs font-semibold text-slate-500"
                          >
                            Open follow-up
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {(loading || loadFailed || visible.length === 0) && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-slate-500"
                    >
                      {loading
                        ? "Loading..."
                        : loadFailed
                          ? "Estimates unavailable."
                          : "No matching estimates."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="text-center text-xs leading-relaxed text-slate-500">
          Saved to your account workspace. Booked values represent
          estimates, not collected revenue.
        </p>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 px-4 py-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-title"
            className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="edit-title" className="text-xl font-bold">
                Edit estimate and contact
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingId(null)}
                className="text-sm font-semibold text-slate-500"
              >
                Cancel
              </button>
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-600">
                {error}
              </p>
            )}

            <form
              className="mt-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;

                let details: Details;

                try {
                  details = formDetails(event.currentTarget);
                } catch (error) {
                  setError(errorMessage(error));
                  return;
                }

                void mutate(async () => {
                  await saveChanges(editing.id, details);

                  if (mounted.current) {
                    setEditingId(null);
                    setNotice("Estimate and contact details updated.");
                  }
                });
              }}
            >
              <fieldset
                disabled={busy}
                className="grid gap-4 disabled:opacity-50 sm:grid-cols-2"
              >
                <DetailFields
                  key={editing.id}
                  estimate={editing}
                  today={today}
                />
                <button className={`${primary} sm:col-span-2`}>
                  {busy ? "Saving..." : "Save changes"}
                </button>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}