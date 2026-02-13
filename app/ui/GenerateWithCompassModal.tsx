"use client";

import { useState } from "react";
import { Button } from "@/app/ui/Button";
import { ItineraryItem, GenerateInput, Meal } from "@/types/itinerary";
import { generateCompassItinerary, chatCompass } from "@/app/plan/[id]/compass/actions";

interface GenerateWithCompassModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (items: ItineraryItem[]) => void;
    planId: string;
    planContext: {
        startTime: string | null;
        endTime: string | null;
        peopleCount: number | null;
    };
}

export default function GenerateWithCompassModal({
    isOpen,
    onClose,
    onGenerate,
    planId,
    planContext,
}: GenerateWithCompassModalProps) {
    const [step, setStep] = useState<"form" | "chat" | "generating" | "preview" | "error">("form");

    // Result State
    const [draftItems, setDraftItems] = useState<ItineraryItem[]>([]);
    const [usage, setUsage] = useState<{ usage: number; limit: number } | null>(null);
    const [error, setError] = useState<any>(null);

    // Form State
    const [budget, setBudget] = useState<"€" | "€€" | "€€€" | null>(null);
    // Walking tolerance removed

    // Meals State
    const [meals, setMeals] = useState<Meal[]>([]);

    const [interests, setInterests] = useState<string[]>([]);
    const [otherInterest, setOtherInterest] = useState("");
    const [showOtherInterest, setShowOtherInterest] = useState(false);

    const [mustInclude, setMustInclude] = useState("");
    const [avoid, setAvoid] = useState("");
    const [workAroundExisting, setWorkAroundExisting] = useState(true);

    // Chat State
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([
        { role: 'assistant', text: "Hi — tell me what kind of day you want in Paris and I'll draft an itinerary." }
    ]);
    const [chatInput, setChatInput] = useState("");
    const [isChatLoading, setIsChatLoading] = useState(false);


    if (!isOpen) return null;

    const toggleInterest = (interest: string) => {
        setInterests((prev) =>
            prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
        );
    };

    const toggleMealType = (type: Meal["type"]) => {
        setMeals(prev => {
            const exists = prev.find(m => m.type === type);
            if (exists) {
                return prev.filter(m => m.type !== type);
            } else {
                return [...prev, { type, cuisine: "Any" }];
            }
        });
    };

    const updateMeal = (type: Meal["type"], updates: Partial<Meal>) => {
        setMeals(prev => prev.map(m => m.type === type ? { ...m, ...updates } : m));
    };

    const addCustomInterest = () => {
        if (otherInterest.trim()) {
            setInterests(prev => [...prev, otherInterest.trim()]);
            setOtherInterest("");
        }
    };



    const handleSendMessage = async () => {
        if (!chatInput.trim() || isChatLoading) return;

        const newMessages = [
            ...chatMessages,
            { role: 'user' as const, text: chatInput }
        ];
        setChatMessages(newMessages);
        setChatInput("");
        setIsChatLoading(true);

        try {
            const response = await chatCompass(newMessages);
            if (response.text) {
                setChatMessages(prev => [...prev, { role: 'assistant', text: response.text }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'assistant', text: `Error: ${response.error || "Unknown error"}` }]);
            }
        } catch (e) {
            console.error("Chat Error:", e);
            setChatMessages(prev => [...prev, { role: 'assistant', text: "Sorry, something went wrong." }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleGenerate = async () => {
        setStep("generating");
        setError(null);

        // Include chat history if we are in chat mode or have messages
        const chatHistory = chatMessages
            .map(m => `${m.role.toUpperCase()}: ${m.text}`)
            .join("\n\n");

        const input: GenerateInput = {
            budget: budget || undefined,
            // walkingTolerance removed
            meals: meals.length > 0 ? meals : undefined,
            activityTypes: interests.length > 0 ? interests : undefined,
            mustInclude: mustInclude || undefined,
            avoid: avoid || undefined,
            workAroundExisting,
            chatPrompt: chatHistory || undefined
        };

        try {
            const result = await generateCompassItinerary(planId, input);

            if (result.error) {
                setError(result.error);
                setUsage(result.usage || null);
                setStep("error");
            } else if (result.items) {
                setDraftItems(result.items);
                setUsage(result.usage || null);
                setStep("preview");
            }
        } catch (e) {
            console.error("Client Compass Error:", e);
            setError({ type: "UNKNOWN", message: "An unexpected error occurred." });
            setStep("error");
        }
    };

    const handleApply = () => {
        onGenerate(draftItems);
        onClose();
        // Reset
        setTimeout(() => {
            setStep("form");
            setDraftItems([]);
        }, 500);
    };

    const formatTime = (time: string | null) => (time ? time.substring(0, 5) : "—");

    const availableActivities = ["Museums", "Landmarks", "Shopping", "Cafés", "Parks", "Scenic views", "Hidden gems", "Nightlife"];

    const mealTypes: Meal["type"][] = ["Breakfast", "Brunch", "Lunch", "Coffee / Snack", "Dinner"];
    const cuisineOptions = ["Any", "Italian", "French", "Japanese", "Vietnamese", "Middle Eastern", "Vegetarian", "Other"];

    const customInterests = interests.filter(i => !availableActivities.includes(i));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-6 border-b border-zinc-100 flex-shrink-0 flex justify-between items-start">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900">
                            {step === "chat" ? "Compass Chat" :
                                step === "preview" ? "Preview Itinerary" :
                                    "Plan your day with Compass"}
                        </h2>
                        {usage && (
                            <p className="text-xs text-zinc-400 mt-1">
                                Compass usage today: {usage.usage}/{usage.limit}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto min-h-[300px]">
                    {step === "generating" && (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4 h-full">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-zinc-500 font-medium animate-pulse">Generating your perfect day in Paris...</p>
                            <p className="text-xs text-zinc-400">Searching Google Places & Asking OpenAI...</p>
                        </div>
                    )}

                    {step === "error" && (
                        <div className="p-8 flex flex-col items-center text-center space-y-4">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-semibold text-zinc-900">
                                {error?.type === "RATE_LIMIT" ? "Daily Limit Reached" : "Generation Failed"}
                            </h3>
                            <p className="text-zinc-500 max-w-sm">
                                {error?.message || "Something went wrong. Please try again."}
                            </p>

                            {error?.type === "OVERFLOW" && error.suggestions && (
                                <div className="mt-4 p-4 bg-amber-50 rounded-lg text-left w-full text-sm text-amber-800">
                                    <p className="font-semibold mb-2">Suggestions:</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        {error.suggestions.map((s: string, i: number) => (
                                            <li key={i}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <Button onClick={() => setStep("form")} variant="secondary">
                                Back to options
                            </Button>
                        </div>
                    )}

                    {step === "preview" && (
                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                                Here is a draft itinerary based on your preferences. Review it below, then click apply to edit it in your plan.
                            </div>

                            <div className="space-y-3">
                                {draftItems.map((item, i) => (
                                    <div key={item.id} className="flex gap-4 p-4 bg-white border border-zinc-200 rounded-xl shadow-sm">
                                        <div className="flex-shrink-0 w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center text-xs font-semibold text-zinc-500">
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-medium text-zinc-900 truncate">{item.title}</h4>
                                                <span className="text-xs text-zinc-500 shrink-0">{item.durationMin} min</span>
                                            </div>
                                            {item.notes && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{item.notes}</p>}
                                            {item.place && (
                                                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                                                    <span>📍 {item.place.name}</span>
                                                    {item.rating && <span>⭐ {item.rating}</span>}
                                                </div>
                                            )}
                                            {item.mapsUrl && (
                                                <a href={item.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:align-baseline mt-1 block">
                                                    View on Maps ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === "chat" && (
                        <div className="flex flex-col h-full bg-zinc-50">
                            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                                {chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-none'
                                            : 'bg-white border border-zinc-200 text-zinc-700 rounded-tl-none shadow-sm'
                                            }`}>
                                            {msg.text}
                                        </div>
                                    </div>
                                ))}
                                {isChatLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-white border border-zinc-200 text-zinc-400 px-4 py-3 rounded-2xl rounded-tl-none text-sm shadow-sm flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                            <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-white border-t border-zinc-200">
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                                    className="flex gap-2"
                                >
                                    <input
                                        autoFocus
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder="Type your message..."
                                        className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!chatInput.trim()}
                                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                    </button>
                                </form>
                                <div className="mt-3 flex justify-center">
                                    <button
                                        onClick={handleGenerate}
                                        className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                        Generate draft from chat
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === "form" && (
                        <div className="p-6 space-y-8">
                            {/* Plan Context */}
                            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
                                <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Plan context</h3>
                                <div className="flex gap-6 text-sm">
                                    <div>
                                        <span className="block text-zinc-400 text-xs mb-0.5">Time Window</span>
                                        <span className="font-medium text-zinc-900">{formatTime(planContext.startTime)} – {formatTime(planContext.endTime)}</span>
                                    </div>
                                    <div>
                                        <span className="block text-zinc-400 text-xs mb-0.5">Travelers</span>
                                        <span className="font-medium text-zinc-900">{planContext.peopleCount || 1} people</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-zinc-900">Preferences</h3>
                                    <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">Optional</span>
                                </div>

                                {/* Work Around Existing Toggle */}
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-700">Work around existing itinerary?</label>
                                    <button
                                        onClick={() => setWorkAroundExisting(!workAroundExisting)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${workAroundExisting ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${workAroundExisting ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {/* Budget */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-700 mb-2">Budget</label>
                                    <div className="flex gap-2">
                                        {["€", "€€", "€€€"].map((b) => (
                                            <button
                                                key={b}
                                                onClick={() => setBudget(b as any)}
                                                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${budget === b
                                                    ? "bg-zinc-900 text-white border-zinc-900"
                                                    : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                                                    }`}
                                            >
                                                {b}
                                            </button>
                                        ))}
                                    </div>
                                </div>


                                {/* Meals */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-zinc-900">Meals</h3>
                                            <p className="text-xs text-zinc-500">Add meal stops to your itinerary. Select one or more.</p>
                                        </div>
                                        <span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-1 rounded-full">Optional</span>
                                    </div>

                                    {/* Meal Type Chips */}
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {mealTypes.map((type) => {
                                            const isSelected = meals.some(m => m.type === type);
                                            return (
                                                <button
                                                    key={type}
                                                    onClick={() => toggleMealType(type)}
                                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${isSelected
                                                        ? "bg-zinc-900 text-white border-zinc-900"
                                                        : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300"
                                                        }`}
                                                >
                                                    {type}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Meal Cards */}
                                    {meals.length > 0 && (
                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                            {meals.map((meal) => (
                                                <div key={meal.type} className="p-4 border border-zinc-200 rounded-xl bg-zinc-50/50 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-medium text-zinc-900">{meal.type}</h4>
                                                        <button
                                                            onClick={() => toggleMealType(meal.type)}
                                                            className="text-xs text-zinc-400 hover:text-red-500"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>

                                                    {/* Cuisine */}
                                                    <div>
                                                        <label className="block text-xs font-medium text-zinc-500 mb-1.5">Cuisine</label>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {cuisineOptions.map((c) => (
                                                                <button
                                                                    key={c}
                                                                    onClick={() => updateMeal(meal.type, {
                                                                        cuisine: c,
                                                                        // Reset custom cuisine if switching back to preset
                                                                        ...(c !== "Other" ? { cuisine: c } : {})
                                                                    })}
                                                                    className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${(meal.cuisine === c) || (c === "Other" && !cuisineOptions.includes(meal.cuisine))
                                                                            ? "bg-white text-zinc-900 border-zinc-300 shadow-sm ring-1 ring-zinc-200"
                                                                            : "bg-transparent text-zinc-500 border-transparent hover:bg-white hover:border-zinc-200"
                                                                        }`}
                                                                >
                                                                    {c}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        {(!cuisineOptions.includes(meal.cuisine) || meal.cuisine === "Other") && (
                                                            <div className="mt-2 animate-in fade-in slide-in-from-left-1">
                                                                <input
                                                                    type="text"
                                                                    value={cuisineOptions.includes(meal.cuisine) ? "" : meal.cuisine}
                                                                    onChange={(e) => updateMeal(meal.type, { cuisine: e.target.value })}
                                                                    placeholder="Type cuisine (e.g. Korean BBQ)..."
                                                                    className="w-full px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3">
                                                        {/* Budget */}
                                                        <div>
                                                            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Budget</label>
                                                            <div className="flex gap-1">
                                                                {["€", "€€", "€€€"].map((b) => (
                                                                    <button
                                                                        key={b}
                                                                        onClick={() => updateMeal(meal.type, { budget: b as any })}
                                                                        className={`flex-1 py-1 rounded-lg text-xs border transition-colors ${meal.budget === b
                                                                                ? "bg-white text-zinc-900 border-zinc-300 shadow-sm ring-1 ring-zinc-200"
                                                                                : "bg-transparent text-zinc-500 border-zinc-200 hover:bg-white"
                                                                            }`}
                                                                    >
                                                                        {b}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Notes */}
                                                        <div>
                                                            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Notes</label>
                                                            <input
                                                                type="text"
                                                                value={meal.notes || ""}
                                                                onChange={(e) => updateMeal(meal.type, { notes: e.target.value })}
                                                                placeholder="pizza, romantic..."
                                                                className="w-full px-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Text Inputs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 mb-1">Must include</label>
                                        <input
                                            type="text"
                                            value={mustInclude}
                                            onChange={(e) => setMustInclude(e.target.value)}
                                            placeholder="Eiffel Tower, river cruise..."
                                            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 mb-1">Avoid</label>
                                        <input
                                            type="text"
                                            value={avoid}
                                            onChange={(e) => setAvoid(e.target.value)}
                                            placeholder="Crowds, museums..."
                                            className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Chat CTA */}
                            <div className="pt-6 border-t border-zinc-100">
                                <h3 className="font-semibold text-zinc-900 mb-3">Or chat with Compass</h3>
                                <div
                                    className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm text-zinc-400 cursor-text hover:border-zinc-300 transition-colors"
                                    onClick={() => setStep("chat")}
                                >
                                    Tell Compass what kind of day you want in Paris...
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === "form" && (
                    <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between flex-shrink-0">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setStep("chat")}>
                                Skip & Chat
                            </Button>
                            <Button onClick={handleGenerate}>
                                Generate Itinerary
                            </Button>
                        </div>
                    </div>
                )}
                {step === "chat" && (
                    <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between flex-shrink-0">
                        <Button variant="ghost" onClick={() => setStep("form")}>Back to Options</Button>
                        <Button variant="ghost" onClick={onClose}>Close</Button>
                    </div>
                )}
                {step === "preview" && (
                    <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between flex-shrink-0">
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setStep("form")}>Back</Button>
                            <Button variant="secondary" onClick={onClose}>Discard</Button>
                        </div>
                        <Button onClick={handleApply}>
                            Apply Itinerary
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
