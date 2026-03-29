"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { Button } from "../../ui/Button";

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
    name: "",
    start_time: "",
    end_time: "",
    people_count: "",
  });

  // ... (useEffect remains unchanged)

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

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const date = `${year}-${month}-${day}`;

    // Prepare insert data
    const insertData: {
      user_id: string;
      city: string;
      date: string;
      start_time: string | null;
      end_time: string | null;
      people_count: number | null;
      preferences: { title?: string };
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
      preferences: {
        title: formData.name.trim() || undefined
      },
      itinerary: { items: [] },
      is_public: false,
    };

    // ... (rest of validation and insert)

    // Validate plan name length
    if (formData.name.trim().length > 100) {
      setError("Plan name must be under 100 characters");
      setIsCreating(false);
      return;
    }

    // Validate time order
    const start = formatTimeForDatabase(formData.start_time);
    const end = formatTimeForDatabase(formData.end_time);
    if (start && end && start >= end) {
      setError("End time must be after start time");
      setIsCreating(false);
      return;
    }

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

    const id = (data as { id: string }).id;
    router.push(`/plan/${id}`);
  }

  // ... (loading state check)

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

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="plan_name"
                className="block text-sm font-medium text-zinc-900 mb-1"
              >
                Plan name
              </label>
              <p className="text-xs text-zinc-400 mb-2">Optional</p>
              <input
                type="text"
                id="plan_name"
                placeholder="e.g. Honeymoon in Paris"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-zinc-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="start_time"
                  className="block text-sm font-medium text-zinc-900 mb-2"
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
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none bg-white"
                />
                <p className="mt-2 text-xs text-zinc-400 font-medium">
                  Default: 10:00
                </p>
              </div>

              <div>
                <label
                  htmlFor="end_time"
                  className="block text-sm font-medium text-zinc-900 mb-2"
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
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none bg-white"
                />
                <p className="mt-2 text-xs text-zinc-400 font-medium">
                  Default: 18:00
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="people_count"
                className="block text-sm font-medium text-zinc-900 mb-2"
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
                className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none bg-white"
              />
              <p className="mt-2 text-xs text-zinc-400 font-medium">
                Default: 1
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg animate-in fade-in slide-in-from-top-1">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <Button
                type="submit"
                disabled={isCreating}
                className="w-full h-12 bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm rounded-xl font-medium tracking-wide active:scale-[0.99] transition-all"
              >
                {isCreating ? "Creating..." : "Create plan"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/plans")}
                disabled={isCreating}
                className="w-full h-10 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl text-sm font-medium"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-8 text-xs text-center text-zinc-400 font-medium tracking-wide">
          Planning for Paris today 🇫🇷
        </p>
      </div>
    </main>
  );
}
