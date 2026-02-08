"use server";

import { createClient } from "@/app/lib/supabaseServer";
import { GenerateInput, ItineraryItem } from "@/types/itinerary";

const MAX_DAILY_GENERATIONS = 20;

// ------------------------------------------------------------------
// CONSTANTS & DEFAULTS
// ------------------------------------------------------------------

const PARIS_DEFAULTS = [
    {
        id: "ChIJLU7jZClu5kcR4PcAYema14c", // Eiffel Tower
        displayName: { text: "Eiffel Tower" },
        formattedAddress: "Champ de Mars, 5 Av. Anatole France, 75007 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=9829567930807750112",
        rating: 4.6,
        userRatingCount: 350000,
        types: ["tourist_attraction", "point_of_interest", "landmark"]
    },
    {
        id: "ChIJD7tiBcp55kcRNJmWKzaEvkw", // Louvre Museum
        displayName: { text: "Louvre Museum" },
        formattedAddress: "Musée du Louvre, 75001 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=13363865620386383060",
        rating: 4.7,
        userRatingCount: 280000,
        types: ["museum", "point_of_interest", "tourist_attraction"]
    },
    {
        id: "ChIJW8B07BrL5kcR_fVwOaVwS4Q", // Luxembourg Gardens
        displayName: { text: "Luxembourg Gardens" },
        formattedAddress: "75006 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=9574744048425285117",
        rating: 4.7,
        userRatingCount: 100000,
        types: ["park", "point_of_interest", "tourist_attraction"]
    },
    {
        id: "ChIJs1d-X15u5kcRj8jWjNn8lT8", // Arc de Triomphe
        displayName: { text: "Arc de Triomphe" },
        formattedAddress: "Pl. Charles de Gaulle, 75008 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=4496476176311896207",
        rating: 4.7,
        userRatingCount: 210000,
        types: ["tourist_attraction", "point_of_interest", "landmark"]
    },
    {
        id: "ChIJ3Q0x8rh55kcR5_wM7bk5_5A", // Sainte-Chapelle
        displayName: { text: "Sainte-Chapelle" },
        formattedAddress: "10 Bd du Palais, 75001 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=10447387228392193255",
        rating: 4.7,
        userRatingCount: 60000,
        types: ["tourist_attraction", "church", "place_of_worship"]
    },
    {
        id: "ChIJeTuH8B5u5kcRj7uL5LjqYyY", // Musée d'Orsay
        displayName: { text: "Musée d'Orsay" },
        formattedAddress: "Esplanade Valéry Giscard d'Estaing, 75007 Paris, France",
        googleMapsUri: "https://maps.google.com/?cid=2735955621458893711",
        rating: 4.7,
        userRatingCount: 140000,
        types: ["museum", "tourist_attraction"]

    }
];

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

async function checkRateLimit(supabase: any, userId: string): Promise<{ allowed: boolean; usage: number; limit: number }> {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
        .from("ai_usage_daily")
        .select("count")
        .eq("user_id", userId)
        .eq("day", today)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is Row not found
        console.error("Rate limit check error:", error);
    }

    const currentCount = data?.count || 0;

    if (currentCount >= MAX_DAILY_GENERATIONS) {
        return { allowed: false, usage: currentCount, limit: MAX_DAILY_GENERATIONS };
    }

    return { allowed: true, usage: currentCount, limit: MAX_DAILY_GENERATIONS };
}

async function incrementUsage(supabase: any, userId: string) {
    const today = new Date().toISOString().split("T")[0];

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

// Helper: Extract detailed preferences from chat history
async function extractPreferencesFromChat(chatLog: string): Promise<Partial<GenerateInput>> {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return {};

    console.log("[Compass] Extracting preferences from chat log...");

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
                    {
                        role: "system",
                        content: `You are a Preference Extractor.
                        Analyze the chat history between a user and Compass (travel assistant).
                        Extract explicit constraints and preferences.
                        
                        OUTPUT JSON ONLY:
                        {
                            "mustInclude": ["specific place names"],
                            "activityTypes": ["museums", "shopping", etc],
                            "avoid": ["crowds", etc],
                            "budget": "€" | "€€" | "€€€" | null,
                            "includeFood": boolean
                        }
                        
                        Rules:
                        - If the user says "I want to go to Cédric Grolet", add "Cédric Grolet" to mustInclude.
                        - Ignore polite chatter.
                        - If no specific constraints, return empty arrays.`
                    },
                    { role: "user", content: chatLog }
                ],
                temperature: 0,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        console.log("[Compass] Extracted preferences:", JSON.stringify(result));

        return {
            mustInclude: result.mustInclude && result.mustInclude.length > 0 ? result.mustInclude.join(", ") : undefined,
            activityTypes: result.activityTypes,
            avoid: result.avoid && result.avoid.length > 0 ? result.avoid.join(", ") : undefined,
            budget: result.budget,
            includeFood: result.includeFood
        };

    } catch (e) {
        console.error("Chat Extraction Error:", e);
        return {};
    }
}

// ------------------------------------------------------------------
// 1. GOOGLE PLACES CANDIDATE FETCHING (Strict V1)
// ------------------------------------------------------------------

async function fetchCandidates(
    city: string,
    input: GenerateInput
): Promise<any[]> {
    const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_MAPS_API_KEY");

    const queries: string[] = [];
    const pinnedQueries: string[] = []; // Queries that MUST be found

    // Construct high-quality queries to get a diverse pool
    // Always append "Paris, France" to ensure bias
    const baseLocation = "Paris, France";

    // 1. Handle Must Includes (Pinned)
    if (input.mustInclude) {
        // Split by comma if multiple are provided in string
        const items = input.mustInclude.split(",").map(s => s.trim()).filter(s => s.length > 0);
        items.forEach(item => {
            pinnedQueries.push(`${item} in ${baseLocation}`);
        });
    }

    // 2. Handle Activity Types
    if (input.activityTypes && input.activityTypes.length > 0) {
        input.activityTypes.forEach(t => queries.push(`best ${t} in ${baseLocation}`));
    } else if (pinnedQueries.length === 0) {
        // Only add defaults if we don't have specific pins, to avoid dilution
        queries.push(`must-see attractions in ${baseLocation}`);
        queries.push(`hidden gems in ${baseLocation}`);
    }

    if (input.includeFood) {
        if (input.cuisines && input.cuisines.length > 0) {
            input.cuisines.forEach(c => queries.push(`best ${c} restaurants in ${baseLocation}`));
        } else {
            queries.push(`top rated restaurants in ${baseLocation}`);
            queries.push(`authentic parisian cafes in ${baseLocation}`);
        }
    }

    // Deduplication Set
    const seenPlaceIds = new Set<string>();
    const candidates: any[] = [];

    // Helper to fetch
    const fetchForQuery = async (query: string, isPinned: boolean = false) => {
        const url = `https://places.googleapis.com/v1/places:searchText`;

        const requestBody = {
            textQuery: query,
            locationBias: {
                circle: {
                    center: { latitude: 48.8566, longitude: 2.3522 },
                    radius: 5000.0 // 5km strict center radius
                }
            },
            maxResultCount: isPinned ? 3 : 8
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_API_KEY,
                    "X-Goog-FieldMask": "places.displayName,places.id,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.types,places.location"
                },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();
            if (data.places) return data.places.map((p: any) => ({ ...p, isPinned })); // Mark as pinned

            if (data.error) console.error(`[Compass] Places API Error for "${query}":`, data.error.message);
            return [];
        } catch (e) {
            console.error(`[Compass] Network Error for "${query}":`, e);
            return [];
        }
    };

    // Execute Pinned Queries First
    if (pinnedQueries.length > 0) {
        console.log(`[Compass] Fetching PINNED items: ${JSON.stringify(pinnedQueries)}`);
        const pinnedResults = await Promise.all(pinnedQueries.map(q => fetchForQuery(q, true)));
        for (const group of pinnedResults) {
            for (const place of group) {
                if (!place.id || seenPlaceIds.has(place.id)) continue;
                seenPlaceIds.add(place.id);
                candidates.push(place);
            }
        }
    }

    // Execute General Queries
    const safeQueries = queries.slice(0, 3);
    const results = await Promise.all(safeQueries.map(q => fetchForQuery(q, false)));

    for (const group of results) {
        for (const place of group) {
            if (!place.id || seenPlaceIds.has(place.id)) continue;

            const name = place.displayName?.text || "";
            if (!name) continue;
            if (input.avoid && name.toLowerCase().includes(input.avoid.toLowerCase())) continue;

            seenPlaceIds.add(place.id);
            candidates.push(place);
        }
    }

    console.log(`[Compass] Total candidates: ${candidates.length} (Pinned: ${candidates.filter((c: any) => c.isPinned).length})`);
    return candidates;
}

// ------------------------------------------------------------------
// 2. CONTROLLED AI SELECTION
// ------------------------------------------------------------------

async function callOpenAI(
    candidates: any[],
    planContext: any,
    input: GenerateInput,
    existingItems: ItineraryItem[]
): Promise<{ items: ItineraryItem[] } | { error: any }> {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    // Prepare candidate list for AI
    const candidateList = candidates.map(c => ({
        id: c.id,
        name: c.displayName.text,
        rating: c.rating,
        tags: c.types ? c.types.slice(0, 3).join(", ") : "",
        isPinned: c.isPinned ? "REQUIRED" : "Optional"
    }));

    const systemPrompt = `You are a strict Selection Engine for a Paris itinerary builder.
    
    TASK:
    Select the best items from the provided "CANDIDATES" list to build a realistic itinerary.
    
    RULES:
    1. You MUST ONLY select items from the "CANDIDATES" list.
    2. You MUST reference selected items by their exact "id".
    3. You MUST include any candidate marked as "REQUIRED" (isPinned) in your selection.
    4. Start Time: ${planContext.startTime}. End Time: ${planContext.endTime}.
    5. Accommodate "Existing Items" if present.
    
    OUTPUT FORMAT (Strict JSON):
    {
       "items": [
          { "placeId": "EXACT_ID_FROM_CANDIDATES", "durationMin": 90, "notes": "Brief reason for selection" }
       ]
    }`;

    const userPrompt = JSON.stringify({
        request: {
            context: planContext,
            preferences: input,
            workAroundExisting: input.workAroundExisting
        },
        existingItems: existingItems.map(i => ({
            title: i.title,
            time: i.fixedStartTime,
            duration: i.durationMin
        })),
        CANDIDATES: candidateList
    });

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
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.2, // Low temp for strictness
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.choices[0].message.content);

        // ------------------------------------------------------------------
        // 3. DETERMINISTIC HYDRATION (No Hallucinations)
        // ------------------------------------------------------------------

        const finalItems: ItineraryItem[] = [];

        if (result.items && Array.isArray(result.items)) {
            for (const item of result.items) {
                const candidate = candidates.find(c => c.id === item.placeId);

                if (!candidate) {
                    console.warn(`[Compass] AI suggested invalid ID "${item.placeId}". Skipping/Filtering out.`);
                    continue; // HARD GUARD: Skip invalid items.
                }

                finalItems.push({
                    id: crypto.randomUUID(),
                    title: candidate.displayName.text, // Source of Truth
                    durationMin: item.durationMin || 60,
                    notes: item.notes,
                    place: {
                        placeId: candidate.id,
                        name: candidate.displayName.text,
                        address: candidate.formattedAddress,
                        lat: candidate.location?.latitude,
                        lng: candidate.location?.longitude
                    },
                    mapsUrl: candidate.googleMapsUri, // Source of Truth
                    placeId: candidate.id,
                    rating: candidate.rating,
                    ratingsTotal: candidate.userRatingCount,
                });
            }
        }

        console.log(`[Compass] Successfully hydrated ${finalItems.length} items.`);
        return { items: finalItems };

    } catch (error: any) {
        console.error("OpenAI Selection Error:", error);
        return { error: { type: "AI_ERROR", message: "Failed to generate plan." } };
    }
}

// ------------------------------------------------------------------
// MAIN ACTION
// ------------------------------------------------------------------

export async function generateCompassItinerary(planId: string, input: GenerateInput) {
    console.log("--> generateCompassItinerary (Strict + Chat) called for plan:", planId);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: { type: "AUTH", message: "Not authenticated" } };

    const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();
    if (!plan) return { error: { type: "NOT_FOUND", message: "Plan not found" } };

    // Rate Limit
    const rateLimit = await checkRateLimit(supabase, user.id);
    if (!rateLimit.allowed) {
        return { error: { type: "RATE_LIMIT", message: "Daily limit reached" }, usage: rateLimit };
    }

    // 0. Extract Chat Preferences if available
    let extractedInput = { ...input };
    if (input.chatPrompt && input.chatPrompt.length > 10) {
        const extracted = await extractPreferencesFromChat(input.chatPrompt);

        // Merge logic: Chat constraints append to/override Form constraints
        if (extracted.mustInclude) {
            extractedInput.mustInclude = input.mustInclude
                ? `${input.mustInclude}, ${extracted.mustInclude}`
                : extracted.mustInclude;
        }
        if (extracted.activityTypes) {
            extractedInput.activityTypes = [...(input.activityTypes || []), ...extracted.activityTypes];
        }
        if (extracted.avoid) extractedInput.avoid = extracted.avoid; // Override avoid
        if (extracted.includeFood !== undefined) extractedInput.includeFood = extracted.includeFood;
    }

    // 1. Fetch Candidates (Source of Truth)
    let candidates = await fetchCandidates(plan.city || "Paris", extractedInput);

    // 2. Fallback if Places API fails or returns 0
    if (candidates.length === 0) {
        console.warn("[Compass] No candidates found from API. Using PARIS_DEFAULTS.");
        candidates = PARIS_DEFAULTS;
    }

    // 3. AI Selection & Hydration
    const result = await callOpenAI(
        candidates,
        {
            date: plan.date,
            startTime: plan.start_time,
            endTime: plan.end_time,
            people_count: plan.people_count
        },
        extractedInput,
        input.workAroundExisting && plan.itinerary?.items ? plan.itinerary.items : [] // existing items
    );

    if ('error' in result) {
        return { error: result.error, usage: rateLimit };
    }

    // 4. Success - Counting
    await incrementUsage(supabase, user.id);
    return {
        items: result.items,
        usage: { ...rateLimit, usage: rateLimit.usage + 1 }
    };
}

// ------------------------------------------------------------------
// CHAT ACTION
// ------------------------------------------------------------------

export async function chatCompass(history: { role: string, text: string }[]) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    const systemPrompt = `You are Compass, an expert travel planner for Paris.
    
    GUIDELINES:
    1. Be concise, helpful, and friendly.
    2. Do NOT write long lists of options.
    3. Do NOT ask open-ended questions like "Which museum do you prefer?". Instead, suggest: "I can generate a plan with museums."
    4. If the user wants an itinerary, ask them to click "Generate draft from chat".
    5. NEVER output a full itinerary execution in text. 
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
