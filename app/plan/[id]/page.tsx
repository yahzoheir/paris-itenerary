"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 pb-20">
      {/* Header */}
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Mobile Header: Back + Title + Date */}
          <div className="flex sm:hidden items-center gap-4 w-full">
            <a href="/plans" className="text-zinc-400 -ml-2 p-2 hover:text-zinc-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            </a>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-zinc-900 truncate leading-tight">
                {(plan?.preferences as any)?.title || plan?.city || "Loading..."}
              </h1>
              {plan && (
                <p className="text-xs text-zinc-500">
                  {new Date(plan.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            {/* Mobile: No Logout/Private badge */}
          </div>

          {/* Desktop Header */}
          <div className="hidden sm:flex items-center gap-4">
            <a href="/" className="font-semibold text-lg tracking-tight hover:opacity-70 transition-opacity">AItinerary.</a>
            {user && (
              <>
                <span className="text-zinc-300">/</span>
                <a href="/plans" className="font-medium hover:text-blue-600 transition-colors">My Plans</a>
              </>
            )}
            <span className="text-zinc-300">/</span>
            <span className="font-medium truncate max-w-[120px] sm:max-w-xs">
              {(plan?.preferences as any)?.title || plan?.city || "Loading..."}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            {isOwner && (
              <Button
                onClick={togglePublic}
                variant="outline"
                size="sm"
                disabled={loading || !plan}
                className={plan?.is_public ? "text-green-600 border-green-200 bg-green-50" : ""}
              >
                {plan?.is_public ? "Public" : "Private"}
              </Button>
            )}
            {user ? (
              <Button onClick={logout} variant="ghost" size="sm">Logout</Button>
            ) : (
              <a href={`/login?next=/plan/${planId}`}>
                <Button variant="primary" size="sm">Login</Button>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {status && <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm">{status}</div>}

        {loading ? (
          <div className="space-y-6">
            <div className="h-40 bg-zinc-100 animate-pulse rounded-2xl" />
            <div className="h-96 bg-zinc-100 animate-pulse rounded-2xl" />
          </div>
        ) : !plan ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-medium">Plan not found</h3>
            <p className="text-zinc-500 mt-2">The plan you are looking for does not exist or you don't have permission to view it.</p>
            <a href="/plans" className="mt-6 inline-block"><Button>Back to Plans</Button></a>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero Header (Reduced Height) */}
            <div className="relative mb-6">
              <div className="h-36 sm:h-48 rounded-2xl bg-zinc-900 overflow-hidden relative shadow-lg">
                <img
                  src="/paris_hero_minimalist_1769709515570.png"
                  className="w-full h-full object-cover opacity-60 mix-blend-overlay"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6 w-full">
                  <div className="flex items-end justify-between">
                    <div>
                      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-1 flex items-center gap-3">
                        {/* Title Editing Logic (Simplified for Mobile) */}
                        {isEditingTitle ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newTitle}
                              onChange={(e) => setNewTitle(e.target.value)}
                              className="bg-white/10 text-white px-3 py-1 rounded-lg border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 text-2xl font-bold w-full min-w-[200px]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTitle();
                                if (e.key === 'Escape') setIsEditingTitle(false);
                              }}
                            />
                            <Button size="sm" onClick={handleSaveTitle} className="bg-white text-zinc-900 hover:bg-zinc-100">Save</Button>
                          </div>
                        ) : (
                          <>
                            <span
                              className={isOwner ? "cursor-pointer hover:underline decoration-white/30 decoration-2 underline-offset-4" : ""}
                              onClick={() => isOwner && setIsEditingTitle(true)}
                            >
                              {(plan.preferences as any)?.title || plan.city}
                            </span>
                          </>
                        )}
                      </h1>
                      <div className="flex items-center gap-3 text-white/90">
                        <span className="text-sm font-medium opacity-90">
                          {new Date(plan.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI-First Primary Actions */}
            {!readOnly && (
              <div className="flex flex-col gap-3 mb-8">
                <Button
                  onClick={() => setIsCompassOpen(true)}
                  className="w-full bg-[#1F2937] hover:bg-[#374151] text-white shadow-sm h-12 text-base font-medium"
                >
                  Generate with Compass
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowAddPanel(true)}
                  className="w-full text-zinc-500 hover:text-zinc-900 h-10 text-sm"
                >
                  Add activity manually
                </Button>
              </div>
            )}

            {/* Compact Trip Overview */}
            <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-4 mb-8 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">Time</div>
                  <div className="font-semibold text-zinc-900 text-sm">
                    {formatTimeForDisplay(plan.start_time)} – {formatTimeForDisplay(plan.end_time)}
                  </div>
                </div>
                <div className="w-px h-8 bg-zinc-200/60" />
                <div>
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">People</div>
                  <div className="font-semibold text-zinc-900 text-sm">{plan.people_count ?? 1}</div>
                </div>
              </div>
              {isOwner && (
                <button
                  onClick={handleEditTimeWindow}
                  className="text-xs font-medium text-zinc-500 hover:text-blue-600 px-2 py-1 hover:bg-zinc-100 rounded-md transition-colors"
                >
                  Adjust
                </button>
              )}
            </div>

            {/* Settings / Adjust Modal (Inline for now if editing) */}
            {isEditingTimeWindow && isOwner && (
              <div className="mb-8 p-4 bg-white border border-blue-100 rounded-xl shadow-sm animate-in slide-in-from-top-2">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">Start Time</label>
                      <input type="time" value={timeWindowForm.start_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, start_time: e.target.value })} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">End Time</label>
                      <input type="time" value={timeWindowForm.end_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, end_time: e.target.value })} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Guests</label>
                    <input type="number" min="1" value={timeWindowForm.people_count} onChange={e => setTimeWindowForm({ ...timeWindowForm, people_count: e.target.value })} className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button size="sm" variant="ghost" onClick={handleCancelTimeWindow}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveTimeWindow}>Save Changes</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Simplified Sharing Toggle */}
            {isOwner && (
              <div className="mb-10 flex items-center justify-between px-1">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-zinc-900">Share this plan</span>
                  <span className="text-xs text-zinc-500">{plan.is_public ? "Publicly visible" : "Private (only you)"}</span>
                </div>
                <div
                  onClick={togglePublic}
                  className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${plan.is_public ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ${plan.is_public ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* Main Content: Itinerary - Single Column Now */}
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-600 rounded-full inline-block"></span>
                    Itinerary
                  </h2>
                </div>

                <div className="relative pl-4 border-l border-zinc-200 ml-2 space-y-8">
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
              <div className="pt-12 border-t border-zinc-200">
                <button
                  onClick={() => setDebugOpen(!debugOpen)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 font-mono transition-colors"
                >
                  {debugOpen ? "[-]" : "[+]"} Developer Debug
                </button>
                {debugOpen && (
                  <pre className="mt-4 p-4 bg-zinc-900 text-zinc-50 rounded-xl text-[10px] overflow-auto max-h-60 font-mono shadow-inner">
                    {JSON.stringify({ preferences: plan.preferences, itinerary: plan.itinerary }, null, 2)}
                  </pre>
                )}
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
