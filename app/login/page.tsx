"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/app/ui/Button";
import { Card, CardBody } from "@/app/ui/Card";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  async function signInWithGoogle() {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      alert(error.message);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center p-6 bg-[#fafafa] overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 z-0 opacity-40 mix-blend-multiply pointer-events-none">
        <img
          src="/paris_hero_minimalist_1769709515570.png"
          className="w-full h-full object-cover blur-3xl scale-110"
          alt=""
        />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-zinc-900 tracking-tight">AItinerary.</h1>
          <p className="text-zinc-500 mt-2 font-medium">Plan your perfect Parisian getaway.</p>
        </div>

        <Card className="border-zinc-200/80 shadow-xl shadow-zinc-200/50 backdrop-blur-sm bg-white/95">
          <CardBody className="p-8 space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-zinc-900">Welcome back</h2>
              <p className="text-sm text-zinc-500 mt-1">Sign in to access your saved itineraries</p>
            </div>

            <button
              onClick={signInWithGoogle}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700 font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-sm group"
            >
              {isLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-100"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-zinc-400 font-medium">or</span>
              </div>
            </div>

            <div className="text-center text-xs text-zinc-400">
              By continuing, you agree to our Terms and Privacy Policy.
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
