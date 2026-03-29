# AItinerary — AI-Powered Paris Day Planner

A full-stack web app that generates personalised day itineraries for Paris using AI. Users describe their ideal day to **Compass** — an AI assistant that searches real venues via Google Places, selects the best candidates through GPT-4o, and produces an editable, shareable schedule.

---

## Features

- **Compass AI — two generation modes**
  - *Chat mode*: conversational interface where users describe their day naturally; GPT-4o-mini extracts specific venue requests from the conversation history before fetching candidates
  - *Form mode*: structured input (activity types, meal slots, cuisine preferences) with a strict validation loop — if the generated plan fails to satisfy all constraints, the error is fed back to the model for up to 3 self-correcting retries
- **Hallucination-proof pipeline** — the AI selects from a candidate list by ID only; IDs not found in the fetched candidates are hard-filtered before the itinerary is saved
- **Drag-and-drop itinerary editor** — reorder activities with automatic time block recalculation and gap detection between stops
- **Plan management** — create, rename, delete, paginate; each plan stores a custom title, time window, guest count, and full itinerary as JSONB
- **Public/private sharing** — toggle plan visibility; public plans are readable without login via Supabase RLS
- **Rate limiting** — 20 AI generations per user per day, enforced atomically via a Supabase RPC function
- **Google OAuth** — authentication via Supabase Auth
- Fully responsive — works on mobile and desktop

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth & Database | Supabase (PostgreSQL + Row Level Security) |
| AI | OpenAI API (GPT-4o, GPT-4o-mini) |
| Places data | Google Places API v1 (Text Search) |
| Drag and drop | dnd-kit |
| Deployment | Vercel |

---

## How Compass Works

The core challenge is producing accurate, non-hallucinated venue data. The pipeline is:

1. **Extract** — in chat mode, GPT-4o-mini parses the full conversation to identify explicitly requested venues ("locked picks")
2. **Fetch** — the Google Places Text Search API is queried in parallel for each activity type and meal slot; results are deduplicated by place ID
3. **Select** — GPT-4o receives the deduplicated candidate list and returns a JSON array of place IDs with durations and notes; it cannot invent new IDs
4. **Hydrate** — each selected ID is matched back to the original candidate object; any unrecognised ID is silently dropped
5. **Validate** (form mode only) — a deterministic validator checks that every requested activity category and meal slot is present and cuisine-matched; failures are appended to the next prompt as explicit constraints

This approach keeps the AI in a pure selection role and ensures the output contains only real, verified venues.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key
- A [Google Cloud](https://console.cloud.google.com) project with **Places API (New)** enabled

### Installation

```bash
git clone <repo-url>
cd paris-itinerary
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_MAPS_API_KEY=your_google_places_api_key
```

### Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
app/
├── page.tsx                  # Landing page
├── login/                    # Google OAuth
├── plans/                    # Dashboard + new plan form
├── plan/[id]/
│   ├── page.tsx              # Plan detail view
│   ├── ItineraryEditor.tsx   # Drag-and-drop editor with time scheduling
│   ├── actions.ts            # Server action: save itinerary to Supabase
│   └── compass/
│       └── actions.ts        # Compass pipeline: fetch → select → hydrate → validate
├── ui/                       # Button, Card, GenerateWithCompassModal
└── lib/                      # Supabase browser/server client helpers
```

---

## Database Schema

**`plans`** — trip data including preferences, time window, guest count, and itinerary (JSONB)
**`ai_usage_daily`** — per-user per-day generation counter; incremented atomically via RPC
**`screen_sessions`** — page-level analytics

All tables use Row Level Security — users access only their own data.

---

## Deployment

Deployed on [Vercel](https://vercel.com). To deploy your own instance:

1. Push to a GitHub repository
2. Import the project on Vercel
3. Add the four environment variables in the Vercel dashboard
4. Deploy
