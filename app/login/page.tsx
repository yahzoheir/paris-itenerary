"use client";

import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      alert(error.message);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Login</h1>
      <button
        onClick={signInWithGoogle}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ccc",
        }}
      >
        Continue with Google
      </button>
    </main>
  );
}
