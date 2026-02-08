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
  const [timeWindowForm, setTimeWindowForm] = useState({
    start_time: "",
    end_time: "",
    people_count: "",
  });

  const [isCompassOpen, setIsCompassOpen] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<ItineraryItem[] | null>(null);
  const [editorKey, setEditorKey] = useState(0);

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

  const initialItems: ItineraryItem[] = generatedItems || (Array.isArray(plan?.itinerary?.items)
    ? plan.itinerary.items
    : []);

  const isOwner = user && plan && user.id === plan.user_id;
  const readOnly = !isOwner;

  return (
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-3">
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
              <Button onClick={logout} variant="ghost" size="sm" className="hidden sm:inline-flex">Logout</Button>
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
            {/* Hero Header (No Card) */}
            <div className="relative mb-8">
              <div className="h-48 rounded-2xl bg-zinc-900 overflow-hidden relative shadow-lg">
                <img
                  src="/paris_hero_minimalist_1769709515570.png"
                  className="w-full h-full object-cover opacity-60 mix-blend-overlay"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-8 w-full">
                  <div className="flex items-end justify-between">
                    <div>
                      <h1 className="text-4xl font-bold text-white mb-2">
                        {(plan.preferences as any)?.title || plan.city}
                      </h1>
                      <div className="flex items-center gap-3 text-white/90">
                        <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium border border-white/10">
                          {new Date(plan.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                        {plan.is_public && (
                          <span className="bg-emerald-500/20 backdrop-blur-md px-3 py-1 rounded-full text-sm font-medium text-emerald-100 border border-emerald-500/30 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Publicly Visible
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Main Content: Itinerary */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-600 rounded-full inline-block"></span>
                    Itinerary
                  </h2>

                  {!readOnly && (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setIsCompassOpen(true)} size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-900 shadow-sm flex items-center gap-2">
                        <span>🧭</span>
                        Generate with Compass
                      </Button>
                      <p className="hidden sm:block text-xs text-zinc-500 max-w-[200px] leading-tight">
                        Compass uses your time window, group size, and preferences to build a personalized itinerary.
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative pl-4 border-l border-zinc-200 ml-2 space-y-8">
                  <ItineraryEditor
                    key={`editor-${editorKey}`}
                    planId={plan.id}
                    initialItems={initialItems}
                    planStartTime={plan.start_time}
                    planEndTime={plan.end_time}
                    readOnly={readOnly}
                  />
                </div>
              </div>

              {/* Sidebar: Settings */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="sticky top-24">
                  <CardHeader className="bg-zinc-50/50">
                    <h3 className="font-semibold text-zinc-900">Trip Overview</h3>
                  </CardHeader>
                  <CardBody>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Time Window</div>
                          <div className="font-semibold text-zinc-900">
                            {formatTimeForDisplay(plan.start_time)} – {formatTimeForDisplay(plan.end_time)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <div>
                          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Travelers</div>
                          <div className="font-semibold text-zinc-900">
                            {plan.people_count ?? 1} people
                          </div>
                        </div>
                      </div>

                      {!isEditingTimeWindow && isOwner && (
                        <Button variant="outline" size="sm" onClick={handleEditTimeWindow} className="w-full">
                          Adjust Settings
                        </Button>
                      )}

                      {isEditingTimeWindow && isOwner && (
                        <div className="pt-4 border-t border-zinc-100 animate-in slide-in-from-top-2">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Start Time</label>
                              <input type="time" value={timeWindowForm.start_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, start_time: e.target.value })} className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">End Time</label>
                              <input type="time" value={timeWindowForm.end_time} onChange={e => setTimeWindowForm({ ...timeWindowForm, end_time: e.target.value })} className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-zinc-500 mb-1">Guests</label>
                              <input type="number" min="1" value={timeWindowForm.people_count} onChange={e => setTimeWindowForm({ ...timeWindowForm, people_count: e.target.value })} className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm" />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button size="sm" variant="ghost" className="flex-1" onClick={handleCancelTimeWindow}>Cancel</Button>
                            <Button size="sm" className="flex-1" onClick={handleSaveTimeWindow}>Save</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>

                {/* Share Card for Owner */}
                {isOwner && (
                  <Card>
                    <CardBody className="space-y-4">
                      <h3 className="font-semibold text-sm text-zinc-900">Sharing</h3>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-500">Share with friends</span>
                        <div
                          onClick={togglePublic}
                          className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${plan.is_public ? 'bg-green-500' : 'bg-zinc-200'}`}
                        >
                          <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${plan.is_public ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {plan.is_public ? "Anyone with the link can see where you're going." : "Only you can see this."}
                      </p>
                    </CardBody>
                  </Card>
                )}
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
