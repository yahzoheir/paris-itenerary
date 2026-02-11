"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image"; // Add Next Image if preferred, but using img tag as before to be safe
import { Playfair_Display } from "next/font/google"; // If I can import here, cool. But standard CSS var is likely better.

import { supabase } from "../../lib/supabaseClient";
import ItineraryEditor from "./ItineraryEditor";
import { saveItineraryItems } from "./actions"; // Import server action
import type { ItineraryItem } from "@/types/itinerary";
import GenerateWithCompassModal from "@/app/ui/GenerateWithCompassModal";
import { Button } from "@/app/ui/Button";
import { Card, CardHeader, CardBody, Badge } from "@/app/ui/Card";

type Plan = {
  id: string;
  user_id: string;
  city: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  people_count: number | null;
  preferences: any;
  itinerary: any;
  is_public: boolean;
  created_at: string;
};

// Convert time from database format (HH:MM:SS or HH:MM) to HTML time input format (HH:MM)
function formatTimeForInput(time: string | null): string {
  if (!time) return "";
  // Extract HH:MM from HH:MM:SS or use as-is if already HH:MM
  return time.substring(0, 5);
}

// Convert time from input format (HH:MM) to database format (HH:MM:SS)
function formatTimeForDatabase(time: string): string | null {
  const trimmed = time.trim();
  if (!trimmed) return null;

  // If already includes seconds (HH:MM:SS format), keep it
  const parts = trimmed.split(":");
  if (parts.length === 3) {
    return trimmed; // Already HH:MM:SS
  }

  // If it's HH:MM format (from HTML time input), append :00
  if (parts.length === 2 && trimmed.match(/^\d{2}:\d{2}$/)) {
    return `${trimmed}:00`;
  }

  // Fallback: return as-is (shouldn't happen with proper time input)
  return trimmed;
}

// Format time for display (always show HH:MM even if DB has HH:MM:SS)
function formatTimeForDisplay(time: string | null): string {
  if (!time) return "—";
  return time.substring(0, 5);
}

export default function PlanPage() {
  const params = useParams();
  const planId = params?.id as string;


  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isEditingTimeWindow, setIsEditingTimeWindow] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [timeWindowForm, setTimeWindowForm] = useState({
    start_time: "",
    end_time: "",
    people_count: "",
  });

  const [isCompassOpen, setIsCompassOpen] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<ItineraryItem[] | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const handleCompassGenerate = async (items: ItineraryItem[]) => {
    // 1. Optimistic Update (UI)
    setGeneratedItems(items);
    setEditorKey((prev) => prev + 1); // Force editor remount to show new items

    // 2. Persist to DB
    if (plan) {
      setStatus("Saving generated itinerary...");
      try {
        await saveItineraryItems(plan.id, items);

        // 3. Update local plan state so if we reload logically it matches
        setPlan((prev) => prev ? { ...prev, itinerary: { items } } : null);
        setStatus("Saved generated itinerary ✅");
      } catch (err) {
        console.error("Failed to save generated itinerary:", err);
        setStatus("Error saving itinerary. Please try again.");
      }
    }
  };

  async function load() {
    setLoading(true);
    setStatus("");

    // 1. Check Auth (but don't redirect yet)
    const { data: userRes } = await supabase.auth.getUser();
    const currentUser = userRes.user;
    setUser(currentUser);

    // 2. Fetch Plan
    // RLS Policy assumption:
    // - Public plans: Allow SELECT for everyone (anon)
    // - Private plans: Allow SELECT only for owner
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (error) {
      if (!currentUser) {
        // If not logged in and can't load (likely private), redirect to login
        // But maybe show a "Private Plan" screen with a Login button instead of auto-redirect?
        // Auto-redirect is often clearer for "protected" links.
        console.log("Plan load failed and no user. Redirecting to login.");
        window.location.href = `/login?next=/plan/${planId}`;
        return;
      }

      // Logged in but error -> Likely 404 or No Permission
      setStatus("Plan not found or access denied.");
      setPlan(null);
      setLoading(false);
      return;
    }

    setPlan(data as Plan);

    // Initialize form
    setTimeWindowForm({
      start_time: formatTimeForInput(data.start_time),
      end_time: formatTimeForInput(data.end_time),
      people_count: data.people_count?.toString() || "",
    });
    setLoading(false);
  }

  useEffect(() => {
    if (!planId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function togglePublic() {
    if (!plan) return;
    setStatus("Updating...");

    const { error } = await supabase
      .from("plans")
      .update({ is_public: !plan.is_public })
      .eq("id", plan.id);

    if (error) {
      setStatus(`Update error: ${error.message}`);
      return;
    }

    setStatus("Updated ✅");
    await load();
  }

  function handleEditTimeWindow() {
    if (!plan) return;
    setTimeWindowForm({
      start_time: formatTimeForInput(plan.start_time),
      end_time: formatTimeForInput(plan.end_time),
      people_count: plan.people_count?.toString() || "",
    });
    setIsEditingTimeWindow(true);
  }

  function handleCancelTimeWindow() {
    setIsEditingTimeWindow(false);
    if (plan) {
      setTimeWindowForm({
        start_time: formatTimeForInput(plan.start_time),
        end_time: formatTimeForInput(plan.end_time),
        people_count: plan.people_count?.toString() || "",
      });
    }
  }

  async function handleSaveTimeWindow() {
    if (!plan) return;
    setStatus("Saving...");

    const normalizedStartTime = formatTimeForDatabase(timeWindowForm.start_time);
    const normalizedEndTime = formatTimeForDatabase(timeWindowForm.end_time);

    const updateData: {
      start_time: string | null;
      end_time: string | null;
      people_count: number | null;
    } = {
      start_time: normalizedStartTime,
      end_time: normalizedEndTime,
      people_count: timeWindowForm.people_count
        ? parseInt(timeWindowForm.people_count, 10)
        : null,
    };

    if (updateData.people_count !== null && updateData.people_count < 1) {
      setStatus("Error: People count must be at least 1");
      return;
    }

    const { error } = await supabase
      .from("plans")
      .update(updateData)
      .eq("id", plan.id);

    if (error) {
      setStatus(`Update error: ${error.message}`);
      return;
    }

    setPlan({
      ...plan,
      start_time: normalizedStartTime,
      end_time: normalizedEndTime,
      people_count: updateData.people_count,
    });

    setTimeWindowForm({
      start_time: formatTimeForInput(normalizedStartTime),
      end_time: formatTimeForInput(normalizedEndTime),
      people_count: updateData.people_count?.toString() || "",
    });

    setStatus("Saved ✅");
    setIsEditingTimeWindow(false);
    await load();
  }

  async function handleSaveTitle() {
    if (!plan) return;
    setStatus("Updating title...");

    const updatedPreferences = {
      ...(plan.preferences as any),
      title: newTitle.trim() || undefined
    };

    const { error } = await supabase
      .from("plans")
      .update({ preferences: updatedPreferences })
      .eq("id", plan.id);

    if (error) {
      setStatus(`Update error: ${error.message}`);
      return;
    }

    setPlan({ ...plan, preferences: updatedPreferences });
    setIsEditingTitle(false);
    setStatus("Title updated ✅");
  }

  // Pre-fill title when entering edit mode
  useEffect(() => {
    if (isEditingTitle && plan) {
      setNewTitle((plan.preferences as any)?.title || plan.city);
    }
  }, [isEditingTitle, plan]);

  const initialItems: ItineraryItem[] = generatedItems || (Array.isArray(plan?.itinerary?.items)
    ? plan.itinerary.items
    : []);

  const isOwner = user && plan && user.id === plan.user_id;
  const readOnly = !isOwner;

  return (
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 pb-20 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Absolute Header for Navigation */}
      <div className="absolute top-0 left-0 right-0 z-40 p-6 flex justify-between items-start pointer-events-none">
        <a href="/plans" className="pointer-events-auto group flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full text-white hover:bg-white/20 transition-all border border-white/10">
          <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          <span className="text-sm font-medium">My Plans</span>
        </a>

        <div className="pointer-events-auto flex items-center gap-3">
          {user ? (
            <Button onClick={logout} variant="ghost" size="sm" className="text-white hover:bg-white/10">Logout</Button>
          ) : (
            <a href={`/login?next=/plan/${planId}`}><Button variant="secondary" size="sm">Login</Button></a>
          )}
        </div>
      </div>

      <div className="relative">
        {status && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full bg-zinc-900/90 text-white backdrop-blur-md shadow-xl text-sm font-medium animate-in fade-in slide-in-from-top-4">{status}</div>}

        {loading ? (
          <div className="h-screen w-full flex items-center justify-center bg-zinc-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm animate-pulse">Designing your experience...</p>
            </div>
          </div>
        ) : !plan ? (
          <div className="h-screen flex flex-col items-center justify-center p-6 text-center">
            <h3 className="text-2xl font-serif mb-2">Plan not found</h3>
            <p className="text-zinc-500 mb-8 max-w-md">The plan you are looking for does not exist or you don't have permission to view it.</p>
            <a href="/plans"><Button>Back to Plans</Button></a>
          </div>
        ) : (
          <div className="animate-in fade-in duration-700">
            {/* Luxury Hero Header */}
            <div className="relative h-[65vh] min-h-[500px] w-full bg-zinc-900 overflow-hidden">
              <div className="absolute inset-0">
                <img
                  src="/paris_hero_minimalist_1769709515570.png"
                  className="w-full h-full object-cover opacity-80 scale-105 animate-in zoom-in-105 duration-[2s]"
                  alt="Paris"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-zinc-900/90" />
              </div>

              {/* Hero Content Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pt-20">
                <div className="backdrop-blur-md bg-white/5 border border-white/10 p-8 md:p-12 rounded-[2rem] shadow-2xl max-w-xl w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
                  {/* Metadata Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                    <div className="bg-black/30 backdrop-blur-lg px-4 py-1.5 rounded-full border border-white/10 text-white/90 text-xs font-semibold uppercase tracking-widest flex items-center gap-2 shadow-sm">
                      <span>🕒</span>
                      {formatTimeForDisplay(plan.start_time)} – {formatTimeForDisplay(plan.end_time)}
                    </div>
                    <div className="bg-black/30 backdrop-blur-lg px-4 py-1.5 rounded-full border border-white/10 text-white/90 text-xs font-semibold uppercase tracking-widest flex items-center gap-2 shadow-sm">
                      <span>👤</span>
                      {plan.people_count ?? 1} {plan.people_count === 1 ? 'Guest' : 'Guests'}
                    </div>
                  </div>

                  <h1 className="text-5xl md:text-7xl font-serif text-white mb-6 tracking-tight drop-shadow-sm leading-tight">
                    {/* Title Editing Logic */}
                    {isEditingTitle ? (
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="bg-transparent border-b border-white/50 text-center w-full focus:outline-none focus:border-white font-serif placeholder-white/50"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle();
                          if (e.key === 'Escape') setIsEditingTitle(false);
                        }}
                        onBlur={handleSaveTitle}
                      />
                    ) : (
                      <span
                        onClick={() => isOwner && setIsEditingTitle(true)}
                        className={isOwner ? "cursor-pointer hover:text-white/80 transition-colors" : ""}
                      >
                        {(plan.preferences as any)?.title || plan.city}
                      </span>
                    )}
                  </h1>

                  <div className="flex items-center justify-center gap-2">
                    <span className="h-px w-8 bg-white/30" />
                    <p className="text-xl text-white/80 font-light tracking-wide font-sans">
                      {new Date(plan.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <span className="h-px w-8 bg-white/30" />
                  </div>
                </div>
              </div>

              {/* Privacy Toggle (Bottom Right of Hero) */}
              {isOwner && (
                <div className="absolute bottom-8 right-8 z-20">
                  <button
                    onClick={togglePublic}
                    className="group flex items-center gap-3 bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 rounded-full pl-4 pr-1.5 py-1.5 transition-all shadow-lg hover:pr-4"
                  >
                    <span className="text-xs font-bold text-white/90 uppercase tracking-widest group-hover:text-white">
                      {plan.is_public ? "Public" : "Private"}
                    </span>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${plan.is_public ? 'bg-emerald-400 text-black rotate-0' : 'bg-white/10 text-white rotate-0 group-hover:bg-white/20'}`}>
                      {plan.is_public ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="max-w-4xl mx-auto px-6 -mt-20 relative z-10 pb-20">
              <div className="bg-white rounded-[2rem] shadow-xl p-8 md:p-10 border border-zinc-100 min-h-[400px]">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-zinc-100/50">
                  <h2 className="text-2xl font-serif text-zinc-900">Your Itinerary</h2>
                  {isOwner && (
                    <button
                      onClick={handleEditTimeWindow}
                      className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors uppercase tracking-wider flex items-center gap-1"
                    >
                      Settings
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                  )}
                </div>

                {/* Settings Panel (Inline) */}
                {isEditingTimeWindow && isOwner && (
                  <div className="mb-8 p-6 bg-zinc-50 rounded-2xl animate-in slide-in-from-top-4 border border-zinc-100">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Start Time</label>
                        <input type="time" value={timeWindowForm.start_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, start_time: e.target.value })} className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">End Time</label>
                        <input type="time" value={timeWindowForm.end_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, end_time: e.target.value })} className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">Guests</label>
                        <input type="number" min="1" value={timeWindowForm.people_count} onChange={e => setTimeWindowForm({ ...timeWindowForm, people_count: e.target.value })} className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all" />
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end mt-6">
                      <Button size="sm" variant="ghost" onClick={handleCancelTimeWindow} className="hover:bg-zinc-200">Cancel</Button>
                      <Button size="sm" onClick={handleSaveTimeWindow} className="bg-zinc-900 text-white shadow-lg shadow-zinc-200">Save Changes</Button>
                    </div>
                  </div>
                )}

                <div className="relative pl-4 space-y-8 min-h-[300px] flex flex-col">
                  {/* Decorative Timeline Line */}
                  <div className="absolute left-[38px] top-4 bottom-4 w-px bg-zinc-100 hidden md:block" />

                  <ItineraryEditor
                    key={`editor-${editorKey}`}
                    planId={plan.id}
                    initialItems={initialItems}
                    planStartTime={plan.start_time}
                    planEndTime={plan.end_time}
                    readOnly={readOnly}
                    isAddPanelOpen={showAddPanel}
                    onSetAddPanelOpen={setShowAddPanel}
                    onOpenCompass={() => setIsCompassOpen(true)}
                  />
                </div>
              </div>
            </div>

            {/* Debug Section */}
            {isOwner && (
              <div className="max-w-4xl mx-auto px-6 pb-20">
                <div className="pt-8 border-t border-zinc-200/50">
                  <button
                    onClick={() => setDebugOpen(!debugOpen)}
                    className="text-[10px] text-zinc-300 hover:text-zinc-600 flex items-center gap-1 font-mono transition-colors uppercase tracking-widest"
                  >
                    {debugOpen ? "[-]" : "[+]"} Developer Debug
                  </button>
                  {debugOpen && (
                    <pre className="mt-4 p-4 bg-zinc-900 text-zinc-50 rounded-xl text-[10px] overflow-auto max-h-60 font-mono shadow-inner">
                      {JSON.stringify({ preferences: plan.preferences, itinerary: plan.itinerary }, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <GenerateWithCompassModal
        isOpen={isCompassOpen}
        onClose={() => setIsCompassOpen(false)}
        onGenerate={handleCompassGenerate}
        planId={plan?.id || planId}
        planContext={{
          startTime: plan?.start_time || null,
          endTime: plan?.end_time || null,
          peopleCount: plan?.people_count || null,
        }}
      />
    </main>
  );
}
