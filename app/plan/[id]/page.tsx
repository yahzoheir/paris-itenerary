"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "../../lib/supabaseClient";
import ItineraryEditor from "./ItineraryEditor";
import type { ItineraryItem } from "@/types/itinerary";

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
  const [email, setEmail] = useState<string | null>(null);
  const [isEditingTimeWindow, setIsEditingTimeWindow] = useState(false);
  const [timeWindowForm, setTimeWindowForm] = useState({
    start_time: "",
    end_time: "",
    people_count: "",
  });

  async function load() {
    setLoading(true);
    setStatus("");

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    // Option A: require login
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setEmail(user.email ?? null);

    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (error) {
      setStatus(`Error loading plan: ${error.message}`);
      setPlan(null);
      setLoading(false);
      return;
    }

    setPlan(data as Plan);
    // Initialize form with current plan values
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

    // Convert HH:MM to HH:MM:SS for database
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

    // Validate people_count
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

    // Update local plan state immediately with normalized DB format
    setPlan({
      ...plan,
      start_time: normalizedStartTime,
      end_time: normalizedEndTime,
      people_count: updateData.people_count,
    });

    // Update form state to match normalized values
    setTimeWindowForm({
      start_time: formatTimeForInput(normalizedStartTime),
      end_time: formatTimeForInput(normalizedEndTime),
      people_count: updateData.people_count?.toString() || "",
    });

    setStatus("Saved ✅");
    setIsEditingTimeWindow(false);
    
    // Still call load() to ensure everything is in sync
    await load();
  }

  const initialItems: ItineraryItem[] = Array.isArray(plan?.itinerary?.items)
    ? plan.itinerary.items
    : [];

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Plan</h1>
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
            href="/plans"
            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-medium"
          >
            Back
          </a>

          <button
            onClick={togglePublic}
            className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            disabled={loading || !plan}
          >
            {plan?.is_public ? "Make private" : "Make public"}
          </button>
        </div>

        {status && <p className="mt-3 text-sm text-zinc-700">{status}</p>}

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          {loading ? (
            <p className="text-sm text-zinc-600">Loading...</p>
          ) : !plan ? (
            <p className="text-sm text-zinc-600">
              Plan not found or you don’t have access.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-semibold">
                  {plan.city} — {plan.date}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  id: <span className="font-mono">{plan.id}</span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {plan.is_public ? "public" : "private"} • created{" "}
                  {new Date(plan.created_at).toLocaleString()}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Time window</div>
                  {!isEditingTimeWindow && (
                    <button
                      onClick={handleEditTimeWindow}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {isEditingTimeWindow ? (
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="start_time"
                        className="block text-xs font-medium text-zinc-700 mb-1"
                      >
                        Start time
                      </label>
                      <input
                        type="time"
                        id="start_time"
                        value={timeWindowForm.start_time}
                        onChange={(e) =>
                          setTimeWindowForm({
                            ...timeWindowForm,
                            start_time: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="end_time"
                        className="block text-xs font-medium text-zinc-700 mb-1"
                      >
                        End time
                      </label>
                      <input
                        type="time"
                        id="end_time"
                        value={timeWindowForm.end_time}
                        onChange={(e) =>
                          setTimeWindowForm({
                            ...timeWindowForm,
                            end_time: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="people_count"
                        className="block text-xs font-medium text-zinc-700 mb-1"
                      >
                        People count
                      </label>
                      <input
                        type="number"
                        id="people_count"
                        min="1"
                        value={timeWindowForm.people_count}
                        onChange={(e) =>
                          setTimeWindowForm({
                            ...timeWindowForm,
                            people_count: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleSaveTimeWindow}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelTimeWindow}
                        className="flex-1 px-4 py-2 bg-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-300 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-zinc-700">
                    {formatTimeForDisplay(plan.start_time)} → {formatTimeForDisplay(plan.end_time)} •{" "}
                    {plan.people_count ?? "—"} people
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-zinc-50 p-3">
                <div className="text-sm font-medium">Itinerary</div>
                {plan && (
                  <div className="mt-2">
                    <ItineraryEditor
                      planId={plan.id}
                      initialItems={initialItems}
                      planStartTime={plan.start_time}
                      planEndTime={plan.end_time}
                    />
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-zinc-50 p-3">
                <div className="text-sm font-medium">Debug (raw JSON)</div>
                <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-white p-3 text-xs">
{JSON.stringify(
  { preferences: plan.preferences, itinerary: plan.itinerary },
  null,
  2
)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Next: add itinerary editor + drag reorder.
        </p>
      </div>
    </main>
  );
}
