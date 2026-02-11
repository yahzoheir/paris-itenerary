"use client";

import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { Button } from "./ui/Button";

export default function HomePage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      setLoading(false);
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-[#fafafa] text-zinc-900 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200/50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-semibold text-lg tracking-tight">AItinerary.</div>
          <div className="flex gap-4 items-center">
            {loading ? (
              <span className="text-xs text-zinc-500">Loading...</span>
            ) : email ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-zinc-600 hidden sm:block">{email}</span>
                <Button onClick={logout} variant="ghost" size="sm" className="text-zinc-400 hover:text-zinc-600">Logout</Button>
                <a href="/plans">
                  <Button variant="primary" size="sm">My Plans</Button>
                </a>
              </div>
            ) : (
              <a href="/login">
                <Button variant="primary" size="sm">Login</Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center gap-12 mb-16">
          <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50/80 border border-blue-100 text-xs font-medium text-blue-700">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              AI itinerary planner
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-zinc-900 leading-[1.05]">
              Design your perfect <br /> day in <span className="text-blue-600">Paris.</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg text-zinc-600 leading-relaxed max-w-md">
              <span className="font-semibold text-blue-600">AI</span>-powered itineraries built around you.
            </p>

            {/* Buttons */}
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
              <a href={email ? "/plans" : "/login"} className="w-full md:w-auto">
                <Button size="lg" className="rounded-full w-full md:w-auto min-h-[48px] px-8 bg-zinc-900 hover:bg-zinc-800 text-white font-medium shadow-lg shadow-zinc-200/50">
                  Start Planning
                </Button>
              </a>
              <Button
                variant="secondary"
                size="lg"
                className="rounded-full w-full md:w-auto min-h-[48px] border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700"
                onClick={scrollToHowItWorks}
              >
                See How It Works
              </Button>
            </div>
          </div>

          {/* Interaction/Illustration */}
          <div className="flex-1 relative w-full aspect-square max-w-md md:max-w-lg">
            <div className="absolute inset-0 bg-blue-50 rounded-[3rem] rotate-3 z-0 border border-blue-100" />
            <div className="absolute inset-0 bg-white rounded-[3rem] -rotate-2 z-10 shadow-2xl shadow-blue-100/50 overflow-hidden border border-zinc-100">
              <img
                src="/paris_hero_minimalist_1769709515570.png"
                alt="Paris Illustration"
                className="w-full h-full object-cover opacity-95 hover:scale-105 transition-transform duration-700"
              />
            </div>
          </div>
        </div>

        {/* Feature List (Moved below for better mobile flow) */}
        <div className="flex flex-wrap justify-center md:justify-start gap-4 md:gap-8 text-sm text-zinc-500 font-medium">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-zinc-100 shadow-sm">
            <span>⚡</span> Optimized schedules
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-zinc-100 shadow-sm">
            <span>🗺</span> Smart routing
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-zinc-100 shadow-sm">
            <span>🤝</span> Easy sharing
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-white border-t border-zinc-100">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-semibold text-center mb-16">Effortless planning in 3 steps</h2>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                title: "Create a Plan",
                desc: "Set your date and time window. We handle the constraints so you don't have to.",
                icon: "1"
              },
              {
                title: "Add Activities",
                desc: "List the spots you want to visit. Drag and drop to reorder and see the schedule update instantly.",
                icon: "2"
              },
              {
                title: "Enjoy & Share",
                desc: "Get a clear timeline for your day. Share with friends or keep it private.",
                icon: "3"
              }
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center space-y-4 group">
                <div className="w-12 h-12 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-lg font-bold text-zinc-900 group-hover:bg-zinc-900 group-hover:text-white transition-colors duration-300">
                  {step.icon}
                </div>
                <h3 className="text-lg font-medium">{step.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-zinc-200 bg-zinc-50">
        <div className="max-w-5xl mx-auto px-6 flex justify-between items-center text-sm text-zinc-500">
          <div>© 2026 AItinerary.</div>
          <div className="flex gap-4">
            <a href="/login" className="hover:text-zinc-900">Login</a>
            <a href="/plans" className="hover:text-zinc-900">My Plans</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
