"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setLoading(false);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight">
          Paris Itinerary Planner
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Plan a day in Paris with preferences, a timeline, and shareable plans.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          {loading ? (
            <p className="text-sm text-zinc-600">Checking session...</p>
          ) : email ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-700">
                Logged in as <span className="font-medium">{email}</span>
              </p>
              <div className="flex gap-2">
                <a
                  href="/app"
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
                >
                  Open Planner
                </a>
                <button
                  onClick={logout}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900"
                >
                  Logout
                </button>
              </div>
              <div className="flex gap-2">
                <a
                  href="/plans"
                  className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-900"
                >
                  My Plans
                </a>
                <a
                  href="/supabase-test"
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-900"
                >
                  DB Test
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-700">
                You’re not logged in. Login to use the planner.
              </p>
              <div className="flex gap-2">
                <a
                  href="/login"
                  className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
                >
                  Login
                </a>
                <a
                  href="/supabase-test"
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-900"
                >
                  DB Test
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-2 text-xs text-zinc-500">
          <p>
            Routes:{" "}
            <span className="font-mono">
              /app • /plans • /plan/[id] • /login
            </span>
          </p>
          <p className="leading-relaxed">
            Next steps: build “My Plans”, plan detail page, sharing, then chatbot +
            Places.
          </p>
        </div>
      </div>
    </main>
  );
}
