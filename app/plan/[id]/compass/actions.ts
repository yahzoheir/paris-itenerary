"use server";

import { createClient } from "@/app/lib/supabaseServer";
import { GenerateInput, ItineraryItem } from "@/types/itinerary";
import type { SupabaseClient } from "@supabase/supabase-js";

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

async function checkAndIncrementUsage(supabase: SupabaseClient, userId: string): Promise<{ allowed: boolean; usage: number; limit: number }> {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase.rpc("increment_ai_usage", {
        p_user_id: userId,
        p_day: today,
        p_limit: MAX_DAILY_GENERATIONS,
    });

    if (error) {
        console.error("Rate limit RPC error:", error);
        // Fail open — allow the request if the RPC itself errors
        return { allowed: true, usage: 0, limit: MAX_DAILY_GENERATIONS };
    }

    return data as { allowed: boolean; usage: number; limit: number };
}

// ------------------------------------------------------------------
// EXTRACT PLACES FROM CHAT (NEW)
// ------------------------------------------------------------------


async function extractPlacesFromChat(chatLog: string): Promise<string[]> {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        console.warn("Missing OPENAI_API_KEY for place extraction");
        return [];
    }

    const systemPrompt = `You are a helper that extracts specific place names from a travel chat.
    
    TASK:
    Identify specific physical venues, landmarks, restaurants, or hotels mentioned in the conversation history as "requested" or "suggested".
    
    CRITICAL:
    - If the ASSISTANT suggested a place (e.g., "I recommend Anahuacalli"), treat it as a "LOCKED PICK".
    - If the USER requested a place (e.g., "I want to go to Cedric Grolet"), treat it as a "LOCKED PICK".
    
    OUTPUT:
    A JSON object with a single key "places" containing an array of strings.
    Example: { "places": ["Anahuacalli", "Cedric Grolet Opéra"] }
    `;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", // Fast & cheap
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: chatLog }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        const result = JSON.parse(data.choices[0].message.content);
        return result.places || [];
    } catch (e) {
        console.error("Place Extraction Error:", e);
        return [];
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

    type QueryMeta = { query: string; cuisineTag?: string };
    const queries: QueryMeta[] = [];

    // Construct high-quality queries to get a diverse pool
    // Always append "Paris, France" to ensure bias
    const baseLocation = "Paris, France";

    if (input.activityTypes && input.activityTypes.length > 0) {
        input.activityTypes.forEach(t => queries.push({ query: `best ${t} in ${baseLocation}` }));
    } else {
        queries.push({ query: `must-see attractions in ${baseLocation}` });
        queries.push({ query: `hidden gems in ${baseLocation}` });
    }

    if (input.meals && input.meals.length > 0) {
        input.meals.forEach(meal => {
            const cuisine = meal.cuisine === "Any" ? "" : `${meal.cuisine} `;
            // Tag with the cuisine so candidates can be identified later in validation
            const cuisineTag = meal.cuisine !== "Any" ? meal.cuisine.toLowerCase() : undefined;

            queries.push({
                query: `best ${cuisine}restaurants for ${meal.type} in ${baseLocation}`,
                cuisineTag
            });

            // Backup query for variety if cuisine is specific
            if (cuisine) {
                queries.push({
                    query: `top rated ${cuisine}places to eat in ${baseLocation}`,
                    cuisineTag
                });
            }
        });
    }

    if (input.mustInclude) {
        queries.push({ query: `${input.mustInclude} in ${baseLocation}` });
    }

    // Deduplication Set
    const seenPlaceIds = new Set<string>();
    const candidates: any[] = [];

    // ------------------------------------------------------
    // 1. Extract Specific Places from Chat (NEW)
    // ------------------------------------------------------
    let explicitPlaceNames: string[] = [];
    if (input.chatPrompt) {
        console.log("[Compass] Extracting places from chat...");
        explicitPlaceNames = await extractPlacesFromChat(input.chatPrompt);
        console.log(`[Compass] Extracted places: ${JSON.stringify(explicitPlaceNames)}`);
    }

    // ------------------------------------------------------
    // 2. Fetch Generic Candidates (Branch A)
    // ------------------------------------------------------
    // Use all queries to ensure we cover every requested meal/activity.
    // Previously limited to 3, which caused dropped meals.
    const safeQueries = queries;
    console.log(`[Compass] Fetching candidates for generic queries (Count: ${safeQueries.length}): ${JSON.stringify(safeQueries)}`);

    const fetchForQuery = async (query: string, isExplicit: boolean = false, cuisineTag?: string) => {
        const url = `https://places.googleapis.com/v1/places:searchText`;

        // Strict Paris Bias
        const requestBody = {
            textQuery: query,
            locationBias: {
                circle: {
                    center: { latitude: 48.8566, longitude: 2.3522 },
                    radius: 5000.0 // 5km strict center radius
                }
            },
            maxResultCount: isExplicit ? 1 : 8 // Get decent chunk per query
        };

        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": GOOGLE_API_KEY,
                    // Request essential fields ONLY.
                    "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.location,places.types"
                },
                body: JSON.stringify(requestBody)
            });

            const data = await res.json();
            if (data.places) {
                return data.places.map((p: any) => ({
                    ...p,
                    ...(isExplicit ? { is_locked_pick: true } : {}),
                    ...(cuisineTag ? { cuisine_match: cuisineTag } : {}),
                }));
            }

            if (data.error) console.error(`[Compass] Places API Error for "${query}":`, data.error.message);
            return [];

        } catch (e) {
            console.error(`[Compass] Network Error for "${query}":`, e);
            return [];
        }
    };

    const genericResultsPromise = Promise.all(
        safeQueries.map(({ query, cuisineTag }) => fetchForQuery(query, false, cuisineTag))
    );

    // ------------------------------------------------------
    // 3. Fetch Specific Candidates (Branch B)
    // ------------------------------------------------------
    const baseSearchLocation = "Paris, France";
    const specificResultsPromise = Promise.all(explicitPlaceNames.map(name =>
        fetchForQuery(`${name} in ${baseSearchLocation}`, true)
    ));

    const [genericResults, specificResults] = await Promise.all([genericResultsPromise, specificResultsPromise]);

    const allGroups = [...genericResults, ...specificResults];

    for (const group of allGroups) {
        for (const place of group) {
            if (!place.id || seenPlaceIds.has(place.id)) continue;

            // Basic filtering
            const name = place.displayName?.text || "";
            if (!name) continue;

            if (input.avoid && name.toLowerCase().includes(input.avoid.toLowerCase())) continue;

            seenPlaceIds.add(place.id);
            candidates.push(place);
        }
    }

    console.log(`[Compass] Total unique candidates found: ${candidates.length}`);
    return candidates;
}

// ------------------------------------------------------------------
// 1.5 FORM PROMPT BUILDER & VALIDATION (NEW)
// ------------------------------------------------------------------

function constructFormSystemPrompt(input: GenerateInput, planContext: any): string {
    let requirements = "";

    // Activity constraints
    if (input.activityTypes && input.activityTypes.length > 0) {
        requirements += `\n    - ACTIVITIES: You MUST include at least one item for EACH of these categories: ${input.activityTypes.join(", ")}.`;
    }

    // Meal constraints
    if (input.meals && input.meals.length > 0) {
        requirements += `\n    - MEALS: You MUST include a stop for EACH requested meal. NO EXCEPTIONS.`;
        input.meals.forEach(m => {
            const cuisineReq = m.cuisine !== "Any" ? `specifically for **${m.cuisine}** cuisine` : "any good cuisine";
            requirements += `\n      * [${m.type}]: REQUIRED. Must be a valid restaurant or cafe for ${m.type}, ${cuisineReq}.`;
            if (m.notes) requirements += ` Context: "${m.notes}".`;
        });
        requirements += `\n    - IF A CUISINE IS SPECIFIED, YOU MUST PICK A PLACE THAT MATCHES IT. DO NOT PICK A GENERIC PLACE.`;
    }

    return `You are a strict Selection Engine for a Paris itinerary builder.

    TASK:
    Select the best items from the provided "CANDIDATES" list to build a realistic itinerary.

    RULES:
    1. You MUST ONLY select items from the "CANDIDATES" list.
    2. You MUST reference selected items by their exact "id".
    3. DO NOT invent, hallucinate, or modify Place IDs or Names.
    4. Start Time: ${planContext.startTime}. End Time: ${planContext.endTime}.
    5. Accommodate "Existing Items" (fix them in place) if present.
    6. MANDATORY: You MUST include items marked "is_locked_pick": true.
       - If a locked item exists for a category (e.g. Dinner), you MUST use it.
    7. For meal slots with a specific cuisine, PREFER candidates where "cuisine_match" equals that cuisine (e.g. "vietnamese", "italian"). These were fetched specifically for that cuisine and are the most reliable match.
    ${requirements}

    OUTPUT FORMAT (Strict JSON):
    {
       "items": [
          { "placeId": "EXACT_ID_FROM_CANDIDATES", "durationMin": 90, "notes": "Brief reason for selection", "source": "chat_locked" | "ai_suggested" }
       ]
    }
    `;
}

function validateItinerary(items: ItineraryItem[], input: GenerateInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const usedItemIds = new Set<string>();

    console.log("[Validation] Selected Meals:", JSON.stringify(input.meals));

    const findMatch = (predicate: (item: ItineraryItem) => boolean): ItineraryItem | undefined => {
        const match = items.find(i => !usedItemIds.has(i.id) && predicate(i));
        if (match) {
            usedItemIds.add(match.id);
            return match;
        }
        return undefined;
    };

    // 1. Validate Activities
    if (input.activityTypes) {
        for (const type of input.activityTypes) {
            const found = findMatch(item => {
                const tags = (item.metadata?.types || []).join(" ").toLowerCase();
                const keyword = type.toLowerCase().replace(/s$/, "");
                return tags.includes(keyword) || item.title.toLowerCase().includes(keyword) || (item.notes || "").toLowerCase().includes(keyword);
            });

            if (!found) {
                errors.push(`Missing activity category: ${type}`);
            }
        }
    }

    // 2. Validate Meals
    if (input.meals) {
        for (const meal of input.meals) {
            const matchedItem = findMatch(item => {
                const tags = (item.metadata?.types || []).join(" ").toLowerCase();
                const title = item.title.toLowerCase();

                // 1. Must be a food place
                const isFoodPlace = tags.includes("food") || tags.includes("restaurant") || tags.includes("cafe") || tags.includes("bakery") || tags.includes("bar") || tags.includes("meal_takeaway");
                if (!isFoodPlace) {
                    // Strict check: if it's not tagged as food, we reject it for a meal slot unless explicit note
                    // User requirement 3: "A meal stop must be identifiable as... category: restaurant OR café"
                    // We will trust 'types'.
                    return false;
                }

                // 2. Cuisine Check
                if (meal.cuisine && meal.cuisine !== "Any") {
                    const reqCuisine = (meal.cuisine === "Other" ? "" : meal.cuisine).toLowerCase();
                    if (reqCuisine) {
                        // Primary: trust the tag set at fetch time (most reliable)
                        const hasCuisineTag = (item.metadata?.cuisineMatch || "") === reqCuisine;
                        // Fallback: check Google Places types and title (less reliable)
                        const content = (tags + " " + title).toLowerCase();
                        const hasTypeMatch = content.includes(reqCuisine);

                        if (!hasCuisineTag && !hasTypeMatch) {
                            return false;
                        }
                    }
                }

                // 3. Type Check (Breakfast/Dinner/etc) - loosely checked by presence in list
                // We assume if it matches cuisine and is a restaurant, it's valid for the slot.

                return true;
            });

            if (!matchedItem) {
                console.warn(`[Validation] Failed to find match for meal: ${meal.type} (${meal.cuisine})`);
                errors.push(`Missing valid stop for: ${meal.type} (${meal.cuisine}). Must be a restaurant/cafe matching the cuisine.`);
            } else {
                console.log(`[Validation] Matched ${meal.type} -> ${matchedItem.title}`);
            }
        }
    }

    const isValid = errors.length === 0;
    console.log(`[Validation] Result: ${isValid ? "PASS" : "FAIL"}`, errors);
    return { valid: isValid, errors };
}

// ------------------------------------------------------------------
// 2. CONTROLLED AI SELECTION
// ------------------------------------------------------------------

async function callOpenAI(
    candidates: any[],
    planContext: any,
    input: GenerateInput,
    existingItems: ItineraryItem[],
    overrideSystemPrompt?: string
): Promise<{ items: ItineraryItem[] } | { error: any }> {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

    // Prepare candidate list for AI (minimized tokens)
    const candidateList = candidates.map(c => ({
        id: c.id,
        name: c.displayName.text,
        rating: c.rating,
        tags: c.types ? c.types.slice(0, 3).join(", ") : "",
        is_locked_pick: c.is_locked_pick,
        cuisine_match: c.cuisine_match || undefined, // e.g. "vietnamese" — set at fetch time
    }));

    const defaultSystemPrompt = `You are a strict Selection Engine for a Paris itinerary builder.
    
    TASK:
    Select the best items from the provided "CANDIDATES" list to build a realistic itinerary.
    
    RULES:
    1. You MUST ONLY select items from the "CANDIDATES" list.
    2. You MUST reference selected items by their exact "id".
    3. DO NOT invent, hallucinate, or modify Place IDs or Names.
    4. Start Time: ${planContext.startTime}. End Time: ${planContext.endTime}.
    5. Accommodate "Existing Items" (fix them in place) if present.
    6. MANDATORY: You MUST include items marked "is_locked_pick": true. 
       - If a locked item exists for a category (e.g. Dinner), you MUST use it.
       - These are venues specifically agreed upon in the chat.
    7. MEALS: If "preferences.meals" are present, you MUST select a suitable candidate for EACH requested meal type (e.g. Lunch, Dinner).
       - For meals with a specific cuisine, PREFER candidates where "cuisine_match" equals that cuisine (e.g. "vietnamese", "italian").
       - Look at the candidate tags/types to ensure it matches.

    OUTPUT FORMAT (Strict JSON):
    {
       "items": [
          { "placeId": "EXACT_ID_FROM_CANDIDATES", "durationMin": 90, "notes": "Brief reason for selection", "source": "chat_locked" | "ai_suggested" }
       ]
    }
    `;

    const systemPrompt = overrideSystemPrompt || defaultSystemPrompt;

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
                    // Metadata for debugging and validation
                    metadata: {
                        source: item.source || (candidate.is_locked_pick ? "chat_locked" : "ai_suggested"),
                        requested_name: candidate.displayName.text,
                        types: candidate.types,
                        cuisineMatch: candidate.cuisine_match, // propagated from fetch-time tag
                    }
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
    console.log("--> generateCompassItinerary (Strict) called for plan:", planId);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: { type: "AUTH", message: "Not authenticated" } };

    const { data: plan } = await supabase.from("plans").select("*").eq("id", planId).single();
    if (!plan) return { error: { type: "NOT_FOUND", message: "Plan not found" } };

    // Rate Limit (atomic check + increment)
    const rateLimit = await checkAndIncrementUsage(supabase, user.id);
    if (!rateLimit.allowed) {
        return { error: { type: "RATE_LIMIT", message: "Daily limit reached" }, usage: rateLimit };
    }

    // 1. Fetch Candidates (Source of Truth)
    let candidates = await fetchCandidates(plan.city || "Paris", input);

    // 2. Fallback if Places API fails or returns 0
    if (candidates.length === 0) {
        console.warn("[Compass] No candidates found from API. Using PARIS_DEFAULTS.");
        candidates = PARIS_DEFAULTS;
    }

    // 3. AI Selection & Hydration (Branching Logic)
    const planContext = {
        date: plan.date,
        startTime: plan.start_time,
        endTime: plan.end_time,
        people_count: plan.people_count
    };
    const existingItems = input.workAroundExisting && plan.itinerary?.items ? plan.itinerary.items : [];

    let result: { items: ItineraryItem[] } | { error: any };

    // A. CHAT MODE (Loose, Conversational)
    if (input.chatPrompt) {
        result = await callOpenAI(candidates, planContext, input, existingItems);
    }
    // B. FORM MODE (Strict, Validated)
    else {
        let attempts = 0;
        const maxAttempts = 3;
        let basePrompt = constructFormSystemPrompt(input, planContext);
        let lastErrors: string[] = [];

        // Initial "empty" result to satisfy TS if loop doesn't run (unlikely) or fails
        result = { items: [] };

        while (attempts < maxAttempts) {
            attempts++;
            let currentPrompt = basePrompt;
            if (lastErrors.length > 0) {
                currentPrompt += `\n\nCRITICAL: Your previous attempt failed strict validation:\n- ${lastErrors.join("\n- ")}\nYou MUST fix these issues in this attempt.`;
            }

            console.log(`[Compass] Form Mode Generation Attempt ${attempts}/${maxAttempts}`);
            result = await callOpenAI(candidates, planContext, input, existingItems, currentPrompt);

            if ('error' in result) break; // Stop on API error

            const validation = validateItinerary(result.items, input);
            if (validation.valid) {
                console.log("[Compass] Validation Passed.");
                break;
            } else {
                console.warn(`[Compass] Validation Failed (Attempt ${attempts}):`, validation.errors);
                // On last attempt, force error or return partial?
                // Returning partial as before.
                lastErrors = validation.errors;
            }
        }

        // 4. Strict Failure if still invalid
        if (lastErrors.length > 0) {
            console.error("[Compass] Failed strict validation after max attempts:", lastErrors);
            return {
                error: {
                    type: "VALIDATION_ERROR",
                    message: "Couldn't satisfy all your requirements after 3 attempts. Try adjusting these:",
                    details: lastErrors
                }
            };
        }
    }

    if ('error' in result) {
        return { error: result.error, usage: rateLimit };
    }

    return {
        items: result.items,
        usage: rateLimit
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
