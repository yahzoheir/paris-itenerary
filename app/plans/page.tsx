"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type PlanRow = {
  id: string;
  city: string;
  date: string;
  created_at: string;
  is_public: boolean;
};

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setStatus("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    setEmail(user.email ?? null);

    const { data, error } = await supabase
      .from("plans")
      .select("id, city, date, created_at, is_public")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setStatus(`Error loading plans: ${error.message}`);
      setPlans([]);
      setLoading(false);
      return;
    }

    setPlans((data as PlanRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createBlankPlan() {
    setStatus("Creating plan...");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("plans")
      .insert({
        user_id: user.id,
        city: "Paris",
        date: today,
        start_time: "10:00",
        end_time: "18:00",
        people_count: 2,
        preferences: {},
        itinerary: { items: [] },
        is_public: false,
      })
      .select("id")
      .single();

    if (error) {
      setStatus(`Insert error: ${error.message}`);
      return;
    }

    const id = (data as { id: string }).id;
    window.location.href = `/plan/${id}`;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function handleDeleteClick(e: React.MouseEvent, plan: PlanRow) {
    e.preventDefault();
    e.stopPropagation();
    setDeleteTargetId(plan.id);
    setDeleteTargetLabel(`${plan.city} — ${plan.date}`);
    setDeleteError(null);
  }

  function handleDeleteCancel() {
    setDeleteTargetId(null);
    setDeleteTargetLabel("");
    setDeleteError(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;

    setIsDeleting(true);
    setDeleteError(null);

    const { error } = await supabase
      .from("plans")
      .delete()
      .eq("id", deleteTargetId);

    if (error) {
      setDeleteError(error.message);
      setIsDeleting(false);
      return;
    }

    // Remove plan from UI immediately
    setPlans((prevPlans) => prevPlans.filter((p) => p.id !== deleteTargetId));
    
    // Close modal
    setDeleteTargetId(null);
    setDeleteTargetLabel("");
    setDeleteError(null);
    setIsDeleting(false);
  }

  // Handle Esc key to close modal
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && deleteTargetId) {
        setDeleteTargetId(null);
        setDeleteTargetLabel("");
        setDeleteError(null);
      }
    }

    if (deleteTargetId) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [deleteTargetId]);

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My plans</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {email ? `Logged in as ${email}` : ""}
            </p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium"
          >
            Logout
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <a
            href="/app"
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-medium"
          >
            Back
          </a>
          <a
            href="/plans/new"
            className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white"
          >
            New plan
          </a>
        </div>

        {status && (
          <p className="mt-3 text-sm text-zinc-700">
            {status}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          {loading ? (
            <p className="text-sm text-zinc-600">Loading...</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-zinc-600">No plans yet. Create one.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {plans.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <a href={`/plan/${p.id}`} className="flex-1 block">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {p.city} — {p.date}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {p.is_public ? "public" : "private"}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    </a>
                    <button
                      onClick={(e) => handleDeleteClick(e, p)}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      aria-label="Delete plan"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Next we'll build <span className="font-mono">/plan/[id]</span>.
        </p>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleDeleteCancel}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal */}
          <div
            className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold mb-2">Delete plan?</h2>
            <p className="text-sm text-zinc-600 mb-6">
              This will permanently delete <span className="font-medium">{deleteTargetLabel}</span>. This action cannot be undone.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{deleteError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isDeleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
