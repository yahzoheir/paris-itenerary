"use server";

import { createClient } from "@/app/lib/supabaseServer";
import { GenerateInput, ItineraryItem, PlaceRef } from "@/types/itinerary";
import { cookies } from "next/headers";

const MAX_DAILY_GENERATIONS = 20;

// Helper: Rate Limit Check
async function checkRateLimit(supabase: any, userId: string): Promise<{ allowed: boolean; usage: number; limit: number }> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD (UTC based)

    const { data, error } = await supabase
        .from("ai_usage_daily")
        .select("count")
        .eq("user_id", userId)
        .eq("day", today)
        .single();

    const currentCount = data?.count || 0;

    if (currentCount >= MAX_DAILY_GENERATIONS) {
        return { allowed: false, usage: currentCount, limit: MAX_DAILY_GENERATIONS };
    }

    return { allowed: true, usage: currentCount, limit: MAX_DAILY_GENERATIONS };
}

// Helper: Increment Usage
async function incrementUsage(supabase: any, userId: string) {
    const today = new Date().toISOString().split("T")[0];

    // Upsert: increment count
    // We can't do atomic increment easily with simple upsert in one go without a stored procedure or raw SQL,
    // but for MVP, reading then upserting is okay, or using on_conflict.
    // Supabase upsert with count+1 requires knowing the current count, which we do from checkRateLimit.
    // Better: use rpc if available, or just simple upset.
    // Let's use a robust upsert pattern.

    const { data: current } = await supabase
        .from("ai_usage_daily")
        .select("count")
        .eq("user_id", userId)
        .eq("day", today)
        .single();

    const newCount = (current?.count || 0) + 1;

    const { error } = await supabase
        .from("ai_usage_daily")
        .upsert(
            { user_id: userId, day: today, count: newCount, updated_at: new Date().toISOString() },
            { onConflict: "user_id, day" }
        );

    if (error) console.error("Rate limit increment failed:", error);
}

// Helper: Fetch Google Places Candidates (New API v1)
async function fetchCandidates(
    city: string,
    input: GenerateInput
): Promise<any[]> {
    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_MAPS_API_KEY");

    const candidates: any[] = [];
    const queries: string[] = [];

    // 1. Build queries based on input
    // Basic Interest Queries
    if (input.activityTypes && input.activityTypes.length > 0) {
        input.activityTypes.forEach(t => queries.push(`${t} in ${city}`));
    } else {
        queries.push(`top attractions in ${city}`);
    }

    // Food Queries
    if (input.includeFood) {
        if (input.cuisines && input.cuisines.length > 0) {
            input.cuisines.forEach(c => queries.push(`best ${c} restaurants in ${city}`));
        } else {
            queries.push(`best restaurants in ${city}`);
        }
    }

    // Custom Must Include
    if (input.mustInclude) {
        queries.push(`${input.mustInclude} in ${city}`);
    }

    // Avoiding duplicates by place_id
    const seenPlaceIds = new Set<string>();

    // Limit queries to avoid timeout/quota issues (max 3-4 parallel)
    const safeQueries = queries.slice(0, 5);

    const fetchForQuery = async (query: string) => {
        const url = `https://places.googleapis.com/v1/places:searchText`;

        // Circular bias for Paris (approximate)
        // Center: 48.8566, 2.3522. Radius: 5000m (5km) to capture strict city center or 10km.
        // Let's use 10km radius.
        const requestBody = {
            textQuery: query,
            locationBias: {
                circle: {
                    center: {
                        latitude: 48.8566,
                        longitude: 2.3522
                    },
                    radius: 10000.0 // meters
                }
            },
            maxResultCount: 10
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_API_KEY,
                    // Request specific fields to avoid over-fetching and ensure we get what we need
                    // FieldMask: places.displayName, places.id, places.formattedAddress, places.rating, places.userRatingCount, places.googleMapsUri, places.types
                    "X-Goog-FieldMask": "places.displayName,places.id,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.editorialSummary"
                },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();

            if (data.places) {
                return data.places;
            } else {
                if (data.error) {
                    console.error("Google Places API v1 Error:", data.error);
                }
            }
        } catch (e) {
            console.error("Google Places v1 Network Error:", e);
        }
        return [];
    };

    const results = await Promise.all(safeQueries.map(q => fetchForQuery(q)));

    console.log(`[Compass] Fetched ${results.length} query groups.`);

    for (const group of results) {
        for (const place of group) {
            if (!place.id || seenPlaceIds.has(place.id)) continue;

            const name = place.displayName?.text || "Unknown Place";

            // Filter by 'avoid'
            if (input.avoid && name.toLowerCase().includes(input.avoid.toLowerCase())) {
                continue;
            }

            seenPlaceIds.add(place.id);
            candidates.push({
                name: name,
                place_id: place.id,
                rating: place.rating,
                user_ratings_total: place.userRatingCount,
                formatted_address: place.formattedAddress,
                types: place.types,
                mapsUrl: place.googleMapsUri, // Direct from API
                summary: place.editorialSummary?.text
            });
        }
    }

    console.log(`[Compass] Total unique candidates: ${candidates.length}`);
    if (candidates.length > 0) {
        console.log("[Compass] Sample candidate:", JSON.stringify(candidates[0], null, 2));
    }

    // Limit candidates to 60 to keep context size manageable
    return candidates.slice(0, 60);
}

// Helper: Call OpenAI
async function callOpenAI(
    candidates: any[],
    planContext: any,
    input: GenerateInput,
    existingItems: ItineraryItem[]
): Promise<{ items: ItineraryItem[] } | { error: any }> {
    /*
    Payload structure:
    - System: You are Compass. Select from candidates.
    - User: Context json. Input json.
    */
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    const systemPrompt = `You are Compass, an expert travel planner.
You MUST create a valid itinerary based on the user's request and the provided CANDIDATE POOL.
Rules:
1. You can ONLY choose places from the CANDIDATE POOL. Do not hallucinate places.
2. The itinerary must fit within the Time Window (${planContext.startTime} - ${planContext.endTime}).
3. Total duration of items + travel time (estimate) must not exceed the window.
4. If "workAroundExisting" is true, you MUST include the existing items in your final output, preserving their times if they are fixed, and scheduling new items around them.
5. If it fits, return valid JSON: { "items": [ ... ] }
6. If it does NOT fit, return JSON: { "error": { "type": "OVERFLOW", "overflowMinutes": 30, "suggestions": ["Remove X", "Shorten Y"] } }
7. Do not include markdown formatting, just raw JSON.
  `;

    const userPrompt = JSON.stringify({
        request: {
            date: planContext.date,
            city: planContext.city,
            startTime: planContext.startTime,
            endTime: planContext.endTime,
            people: planContext.people_count,
            preferences: input,
        },
        existingItinerary: existingItems.map(i => ({ title: i.title, time: i.fixedStartTime, duration: i.durationMin })),
        candidates: candidates.map(c => ({
            id: c.place_id,
            name: c.name,
            rating: c.rating,
            address: c.formatted_address,
            types: c.types
        }))
    });

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o", // or gpt-4-turbo or gpt-3.5-turbo
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const content = data.choices[0].message.content;
        const result = JSON.parse(content);

        if (result.error) {
            return { error: result.error };
        }

        // Hydrate items with candidate data
        console.log(`[Compass] Hydrating ${result.items?.length} items from AI result.`);
        const finalItems: ItineraryItem[] = (result.items || []).map((item: any) => {
            // Find candidate
            const candidate = candidates.find(c => c.place_id === item.placeId);

            if (!candidate) {
                console.warn(`[Compass] Candidate not found for ID: ${item.placeId}. Fallback to name: ${item.placeName}`);
            }

            return {
                id: crypto.randomUUID(),
                title: candidate ? candidate.name : item.title || item.placeName, // Use candidate name if available
                durationMin: item.durationMin,
                notes: item.notes,
                place: candidate ? {
                    placeId: candidate.place_id,
                    name: candidate.name,
                    address: candidate.formatted_address,
                } : { name: item.placeName },
                mapsUrl: candidate ? candidate.mapsUrl : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.placeName || item.title)}`,
                rating: candidate?.rating,
                ratingsTotal: candidate?.user_ratings_total
            };
        });

        console.log(`[Compass] Final items count: ${finalItems.length}`);
        return { items: finalItems };

    } catch (error: any) {
        console.error("OpenAI Error:", error);
        return { error: { type: "AI_ERROR", message: "Failed to generate plan." } };
    }
}

// --- Main Action ---

export async function generateCompassItinerary(planId: string, input: GenerateInput) {
    console.log("--> generateCompassItinerary called for plan:", planId);
    console.log("    Env check - OPENAI:", !!process.env.OPENAI_API_KEY, "GOOGLE:", !!process.env.GOOGLE_MAPS_API_KEY);

    const supabase = await createClient();

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: { type: "AUTH", message: "Not authenticated" } };
    }

    // 2. Fetch Plan & Authorization
    const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("*")
        .eq("id", planId)
        .single();

    if (planError || !plan) {
        return { error: { type: "NOT_FOUND", message: "Plan not found" } };
    }

    if (plan.user_id !== user.id) {
        return { error: { type: "FORBIDDEN", message: "Not authorized" } };
    }

    // 3. Rate Limit Check
    const rateLimit = await checkRateLimit(supabase, user.id);
    if (!rateLimit.allowed) {
        return {
            error: {
                type: "RATE_LIMIT",
                message: "Daily AI limit reached",
                limit: rateLimit.limit
            },
            usage: rateLimit
        };
    }

    try {
        // 4. Fetch Candidates (Google)
        const city = plan.city || "Paris";
        const candidates = await fetchCandidates(city, input);

        if (candidates.length === 0) {
            return { error: { type: "NO_CANDIDATES", message: "Could not find places matching criteria." } };
        }

        // 5. Generate (OpenAI)
        const result = await callOpenAI(
            candidates,
            {
                date: plan.date,
                city: plan.city || "Paris",
                startTime: plan.start_time,
                endTime: plan.end_time,
                people_count: plan.people_count
            },
            input,
            input.workAroundExisting && plan.itinerary?.items ? plan.itinerary.items : []
        );

        if ('error' in result && result.error) {
            // Pass strict errors like OVERFLOW back to UI
            return { error: result.error, usage: rateLimit };
        }

        // 6. Increment Usage on Success
        await incrementUsage(supabase, user.id);

        return {
            items: (result as { items: ItineraryItem[] }).items,
            usage: { ...rateLimit, usage: rateLimit.usage + 1 }
        };

    } catch (e: any) {
        console.error("Compass Generation Error:", e);
        return { error: { type: "INTERNAL", message: "An unexpected error occurred." } };
    }
}

// --- Chat Action ---

export async function chatCompass(history: { role: string, text: string }[]) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    const systemPrompt = `You are Compass, an expert travel planner for Paris.
    You are chatting with a user to help them plan a day in Paris.
    Ask clarifying questions about their preferences (budget, interests, pace, food) if they haven't provided them.
    Keep responses concise and helpful.
    Refuse to discuss topics unrelated to travel in Paris.
    IMPORTANT: If the user asks you to "generate" or "create" an itinerary, DO NOT output a full itinerary here. Instead, ask them to click the "Generate draft from chat" button below so you can build it in their plan.
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history.map(h => ({ role: h.role, content: h.text }))
                ],
                temperature: 0.7,
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        return { text: data.choices[0].message.content };
    } catch (error: any) {
        console.error("Chat Error:", error);
        return { error: error.message || String(error) };
    }
}
