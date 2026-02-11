"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button } from "../ui/Button";
import { Card, CardBody, Badge } from "../ui/Card";

type PlanRow = {
  id: string;
  city: string;
  date: string;
  created_at: string;
  is_public: boolean;
  start_time: string | null;
  end_time: string | null;
  people_count: number | null;
  preferences: { title?: string } | null;
};

const CARD_IMAGES = [
  "/paris_street_card_bg_1769713095170.png",
  "/paris_card_cafe_1769713467791.png",
  "/paris_card_eiffel_1769713481681.png",
  "/paris_card_seine_1769713494515.png",
  "/paris_card_louvre_1769713510168.png",
  "/paris_card_montmartre_1769713523160.png",
  "/paris_card_metro_1769713535929.png"
];

export default function PlansPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

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
      .select("id, city, date, created_at, is_public, start_time, end_time, people_count, preferences")
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

  function handleRenameClick(e: React.MouseEvent, plan: PlanRow) {
    e.preventDefault();
    e.stopPropagation();
    setRenameTargetId(plan.id);
    setRenameValue(plan.preferences?.title || plan.city);
    setRenameError(null);
  }

  function handleRenameCancel() {
    setRenameTargetId(null);
    setRenameValue("");
    setRenameError(null);
  }

  async function handleRenameConfirm() {
    if (!renameTargetId) return;
    setIsRenaming(true);
    setRenameError(null);

    // Find the plan to preserve other preferences if they existed (though here we only have title in types usually)
    const plan = plans.find(p => p.id === renameTargetId);
    const updatedPreferences = {
      ...(plan?.preferences || {}),
      title: renameValue.trim() || undefined
    };

    const { error } = await supabase
      .from("plans")
      .update({ preferences: updatedPreferences })
      .eq("id", renameTargetId);

    if (error) {
      setRenameError(error.message);
      setIsRenaming(false);
      return;
    }

    // Update UI
    setPlans(prev => prev.map(p =>
      p.id === renameTargetId
        ? { ...p, preferences: updatedPreferences }
        : p
    ));

    setIsRenaming(false);
    setRenameTargetId(null);
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
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="font-semibold text-lg tracking-tight hover:opacity-70 transition-opacity">AItinerary.</a>
            <span className="text-zinc-300">/</span>
            <span className="font-medium">My Plans</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500 hidden sm:block">{email}</span>
            <div className="hidden md:block">
              <Button onClick={logout} variant="ghost" size="sm">Logout</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {status && (
          <div className="mb-8 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm animate-in slide-in-from-top-2">
            {status}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 tracking-tight">Your Trips</h1>
            <p className="text-zinc-500 mt-2 font-medium">Manage your upcoming adventures and past memories.</p>
          </div>
          <div className="hidden md:block">
            {/* Desktop secondary action if needed, or keeping it clean */}
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 rounded-2xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Create New Plan Card */}
            <a
              href="/plans/new"
              className="group relative flex flex-col items-start justify-between p-6 h-full min-h-[320px] rounded-2xl bg-white border border-zinc-200 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all duration-300"
            >
              <div className="flex flex-col gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 leading-tight">Create a new <br /> day in Paris</h3>
                  <p className="text-sm text-zinc-500 mt-2 font-medium">AI can build it in seconds.</p>
                </div>
              </div>

              <div className="w-full mt-8">
                <Button className="w-full justify-center bg-zinc-900 text-white hover:bg-zinc-800 shadow-lg shadow-zinc-200/50">
                  Start Planning
                </Button>
              </div>
            </a>

            {/* 2. Existing Plans */}
            {plans.map((p, i) => (
              <a key={p.id} href={`/plan/${p.id}`} className="group block focus:outline-none h-full">
                <Card className="h-full flex flex-col hover:shadow-xl hover:shadow-zinc-200/50 hover:border-zinc-300 transition-all duration-300 group-hover:-translate-y-1 active:scale-[0.99] relative group-focus:ring-2 group-focus:ring-zinc-900 group-focus:ring-offset-2 overflow-hidden bg-white rounded-2xl border-0 ring-1 ring-zinc-200">

                  {/* Actions (Visible on Hover) */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-30 flex gap-2">
                    <button
                      onClick={(e) => handleRenameClick(e, p)}
                      className="p-2 bg-white/90 backdrop-blur rounded-full text-zinc-400 hover:text-blue-600 hover:bg-blue-50 border border-zinc-200/50 shadow-sm transition-colors"
                      title="Rename plan"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(e, p)}
                      className="p-2 bg-white/90 backdrop-blur rounded-full text-zinc-400 hover:text-red-600 hover:bg-red-50 border border-zinc-200/50 shadow-sm transition-colors"
                      title="Delete plan"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  {/* Card Header (Image + Overlay) */}
                  <div className="h-48 relative overflow-hidden group-hover:opacity-95 transition-opacity rounded-t-2xl">
                    <img
                      src={CARD_IMAGES[i % CARD_IMAGES.length]}
                      className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
                      alt=""
                    />
                    {/* Gradient Overlay for Text */}
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                    {/* AI Badge (Top Left) - Logic: Randomly show for demo or if preference implies it */}
                    {(i % 3 === 0) && (
                      <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-md border border-white/30 text-[10px] font-medium text-white flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                        Built with Compass
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 p-4 w-full">
                      <h3 className="text-2xl font-bold text-white leading-none tracking-tight mb-1.5 drop-shadow-md truncate">
                        {p.preferences?.title || p.city}
                      </h3>
                      <p className="text-white/80 font-medium text-xs uppercase tracking-wider drop-shadow-md">
                        {new Date(p.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  {/* Card Body - Compressed Metadata */}
                  <CardBody className="p-4 flex-1 flex flex-col justify-end bg-white">
                    <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                      {/* Time & People */}
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {p.start_time?.slice(0, 5) || "10:00"}–{p.end_time?.slice(0, 5) || "18:00"}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                          {p.people_count ?? 1}
                        </span>
                      </div>

                      {/* Privacy Status */}
                      <span className={`flex items-center gap-1.5 ${p.is_public ? 'text-emerald-600' : 'text-zinc-400'}`}>
                        {p.is_public ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        )}
                        {p.is_public ? "Public" : "Private"}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleDeleteCancel}
        >
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200" />

          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 text-red-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>

            <h2 className="text-xl font-semibold text-zinc-900 mb-2">Delete plan?</h2>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-medium text-zinc-900">{deleteTargetLabel}</span>? This action cannot be undone.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {deleteError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={handleDeleteCancel} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm} isLoading={isDeleting}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={handleRenameCancel}
        >
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm animate-in fade-in duration-200" />

          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-zinc-900 mb-4">Rename Plan</h2>

            <div className="mb-6">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full px-4 py-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                placeholder="Plan Name"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
              />
            </div>

            {renameError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {renameError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={handleRenameCancel} disabled={isRenaming}>
                Cancel
              </Button>
              <Button onClick={handleRenameConfirm} isLoading={isRenaming}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
