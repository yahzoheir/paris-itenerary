// app/plan/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import type { ItineraryItem } from "@/types/itinerary";
import { createClient } from "@/app/lib/supabaseServer";

export async function saveItineraryItems(planId: string, items: ItineraryItem[]) {
  const supabase = await createClient();

  // 1. Verify Auth
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    throw new Error("Not authenticated (server). Please refresh and try again.");
  }

  // 2. Update Plan with Ownership Check
  const { data, error } = await supabase
    .from("plans")
    .update({ itinerary: { items } })
    .eq("id", planId)
    .eq("user_id", auth.user.id) // Enforce ownership
    .select("id"); // IMPORTANT: no .single()

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length === 0) {
    throw new Error("Update blocked. You may not be the owner or the plan doesn't exist.");
  }

  // 3. Revalidate
  revalidatePath(`/plan/${planId}`);
  return { ok: true };
}
