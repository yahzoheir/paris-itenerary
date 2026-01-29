"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AppHomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setEmail(user.email ?? null);
      setLoading(false);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) return <main style={{ padding: 24 }}>Loading...</main>;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Planner</h1>
          <p style={{ opacity: 0.8 }}>Logged in as {email}</p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="/plans" style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 10 }}>
            My plans
          </a>
          <button
            onClick={logout}
            style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 10 }}
          >
            Logout
          </button>
        </div>
      </header>

      <section style={{ marginTop: 24 }}>
        <p style={{ opacity: 0.9 }}>
          Next: we’ll add the chat UI here and create plans from the conversation.
        </p>
        <p style={{ marginTop: 10 }}>
          For now, go to <a href="/plans">My plans</a>.
        </p>
      </section>
    </main>
  );
}
