"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState<string>("");

  async function testConnection() {
    setStatus("Testing...");

    const { data, error } = await supabase
      .from("plans")
      .select("id")
      .limit(1);

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus(`Success ✅ (fetched ${data?.length ?? 0} row(s))`);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Supabase Connection Test</h1>
      <button
        onClick={testConnection}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ccc",
        }}
      >
        Test
      </button>
      <p style={{ marginTop: 12 }}>{status}</p>
      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Note: If you see an RLS error, that’s expected until we add login (optional).
      </p>
    </main>
  );
}
