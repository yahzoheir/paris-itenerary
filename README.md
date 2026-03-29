# AItinerary — AI-Powered Paris Day Planner

A full-stack web app that generates personalized day itineraries for Paris using AI. Users answer a few questions about their preferences, and the **Compass** engine combines OpenAI and Google Places to build an optimized, editable schedule.

---

## Features

- **AI Itinerary Generation (Compass)** — Generates a full day plan based on budget, cuisine, and activity preferences using GPT-4o-mini and the Google Places API
- **Conversational Refinement** — Chat interface to swap specific places in the itinerary
- **Drag-and-Drop Editor** — Reorder activities with automatic schedule recalculation
- **Plan Management** — Create, rename, delete, and manage multiple plans
- **Google OAuth** — Authentication via Supabase
- **Rate Limiting** — 20 AI generations per user per day
- **Public/Private Plans** — Share plans or keep them private

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth & DB | Supabase (PostgreSQL + Row Level Security) |
| AI | OpenAI API (gpt-4o-mini) |
| Places | Google Places API (Text Search) |
| Drag & Drop | @dnd-kit |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key
- A [Google Maps Platform](https://developers.google.com/maps) API key with **Places API** enabled

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
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Database Setup

Run the migration in your Supabase project to create the `ai_usage_daily` table:

```bash
# Via Supabase CLI
supabase db push
```

Or apply `supabase/migrations/20250130_ai_usage_daily.sql` manually in the Supabase SQL editor.

The app also expects `plans` and `screen_sessions` tables — create these via your Supabase dashboard or additional migration files.

### Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
paris-itinerary/
├── app/
│   ├── api/screen-sessions/    # Analytics endpoint
│   ├── components/             # Shared components (ScreenTracker)
│   ├── lib/                    # Supabase client helpers
│   ├── login/                  # Google OAuth login page
│   ├── plan/[id]/              # Plan editor + Compass AI actions
│   ├── plans/                  # Plans dashboard
│   └── ui/                     # Reusable UI components
├── types/
│   └── itinerary.ts            # Shared TypeScript types
├── supabase/
│   └── migrations/             # Database migrations
├── scripts/
│   └── test-chat-extraction.js # Dev utility for testing place extraction
└── middleware.ts                # Supabase session middleware
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Database Schema

### `plans`
Stores user trip plans including preferences and the generated itinerary as JSONB.

### `ai_usage_daily`
Tracks AI generation count per user per day to enforce the 20-generation daily limit.

### `screen_sessions`
Tracks which pages users visit and how long they spend on each screen.

All tables use Supabase Row Level Security — users can only access their own data.

---

## Deployment

The app is deployed on [Vercel](https://vercel.com). To deploy your own instance:

1. Push to a GitHub repository
2. Import the project on Vercel
3. Add the four environment variables in the Vercel dashboard
4. Deploy
