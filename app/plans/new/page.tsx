"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

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
  
  // Fallback: return as-is
  return trimmed;
}

export default function NewPlanPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    start_time: "",
    end_time: "",
    people_count: "",
  });

  useEffect(() => {
    async function checkAuth() {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);
      setLoading(false);
    }

    checkAuth();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);
    setError(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;

    if (!user) {
      setError("You must be logged in to create a plan");
      setIsCreating(false);
      return;
    }

    // Get today's date in YYYY-MM-DD format (local time)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const date = `${year}-${month}-${day}`;

    // Prepare insert data with defaults
    const insertData: {
      user_id: string;
      city: string;
      date: string;
      start_time: string | null;
      end_time: string | null;
      people_count: number | null;
      preferences: {};
      itinerary: { items: [] };
      is_public: boolean;
    } = {
      user_id: user.id,
      city: "Paris",
      date,
      start_time: formatTimeForDatabase(formData.start_time) || "10:00:00",
      end_time: formatTimeForDatabase(formData.end_time) || "18:00:00",
      people_count: formData.people_count
        ? parseInt(formData.people_count, 10)
        : 1,
      preferences: {},
      itinerary: { items: [] },
      is_public: false,
    };

    // Validate people_count
    if (insertData.people_count !== null && insertData.people_count < 1) {
      setError("People count must be at least 1");
      setIsCreating(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("plans")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      setError(`Failed to create plan: ${insertError.message}`);
      setIsCreating(false);
      return;
    }

    // Redirect to the created plan
    const id = (data as { id: string }).id;
    router.push(`/plan/${id}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900">
        <div className="mx-auto w-full max-w-md">
          <p className="text-sm text-zinc-600">Loading...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">New plan</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {email ? `Logged in as ${email}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="start_time"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Start time
              </label>
              <input
                type="time"
                id="start_time"
                value={formData.start_time}
                onChange={(e) =>
                  setFormData({ ...formData, start_time: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Leave empty to use default (10:00)
              </p>
            </div>

            <div>
              <label
                htmlFor="end_time"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                End time
              </label>
              <input
                type="time"
                id="end_time"
                value={formData.end_time}
                onChange={(e) =>
                  setFormData({ ...formData, end_time: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Leave empty to use default (18:00)
              </p>
            </div>

            <div>
              <label
                htmlFor="people_count"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                People count
              </label>
              <input
                type="number"
                id="people_count"
                min="1"
                value={formData.people_count}
                onChange={(e) =>
                  setFormData({ ...formData, people_count: e.target.value })
                }
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Leave empty to use default (1)
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.push("/plans")}
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-zinc-200 text-zinc-700 rounded-lg hover:bg-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isCreating ? "Creating..." : "Create plan"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          City is set to Paris. Date will be today.
        </p>
      </div>
    </main>
  );
}
