import { createClient } from "@/app/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action } = body;

        if (action === "start") {
            const { screen, metadata } = body;

            const { data, error } = await supabase
                .from("screen_sessions")
                .insert({
                    user_id: user.id,
                    screen,
                    metadata,
                })
                .select("id")
                .single();

            if (error) throw error;

            return NextResponse.json({ sessionId: data.id });
        }

        if (action === "end") {
            const { sessionId } = body;

            // We calculate duration in SQL or just set left_at and let client/analysis handle it
            // For this requirement: "updates that row... setting left_at and duration_ms"
            // We'll calculate duration using database time difference to be precise, or just update left_at.
            // Requirement says "updates that row (owned by user) setting left_at and duration_ms"

            // Let's first get the entered_at to calculate duration, or rely on a trigger? 
            // The requirement implies we should set it. Let's do a two-step or a smart update.
            // Easiest is to update left_at = now() and duration_ms = extract(epoch from (now() - entered_at)) * 1000
            // but Supabase/Postgres syntax via JS client:

            const { data: session, error: fetchError } = await supabase
                .from("screen_sessions")
                .select("entered_at")
                .eq("id", sessionId)
                .eq("user_id", user.id)
                .single();

            if (fetchError || !session) {
                return NextResponse.json({ error: "Session not found" }, { status: 404 });
            }

            const leftAt = new Date().toISOString();
            const enteredAt = new Date(session.entered_at).getTime();
            const durationMs = new Date(leftAt).getTime() - enteredAt;

            const { error } = await supabase
                .from("screen_sessions")
                .update({
                    left_at: leftAt,
                    duration_ms: durationMs
                })
                .eq("id", sessionId)
                .eq("user_id", user.id);

            if (error) throw error;

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        console.error("Screen session error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
