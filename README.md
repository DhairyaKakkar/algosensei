# AlgoSensei

AI-powered competitive programming coach for Codeforces users. Analyzes your submission history, identifies skill weaknesses, and provides personalized problem recommendations and Socratic coaching sessions.

## Features

- **Profile analysis** — Fetches and analyzes your full Codeforces submission history
- **Skill radar** — Visual breakdown of skill scores across 10 topic areas (DP, Graphs, Greedy, etc.)
- **AI coaching chat** — Socratic coaching on any Codeforces problem via GPT-4o
- **Smart recommendations** — AI-ranked practice problems targeting your weakest topics
- **Dashboard** — Stats, weekly activity, and recommended next problems
- **Auth** — Email/password and GitHub OAuth via Supabase

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```env
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Set up Supabase auth

#### Email/password auth
Works out of the box — no extra configuration needed.

#### GitHub OAuth

1. **Create a GitHub OAuth App**
   - Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
   - Click **New OAuth App**
   - Set **Homepage URL** to `http://localhost:3000` (or your production URL)
   - Set **Authorization callback URL** to:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - Save, then copy the **Client ID** and generate a **Client Secret**

2. **Enable GitHub provider in Supabase**
   - Open your [Supabase project dashboard](https://supabase.com/dashboard)
   - Go to **Authentication → Providers**
   - Enable **GitHub** and paste your Client ID and Client Secret
   - Save

3. **Add redirect URLs in Supabase**
   - In Supabase, go to **Authentication → URL Configuration**
   - Add to **Redirect URLs**:
     ```
     http://localhost:3000/auth/callback
     ```
   - For production deployments also add:
     ```
     https://yourdomain.com/auth/callback
     ```
   - Save

4. **Set `NEXT_PUBLIC_APP_URL`** in `.env.local` to match your environment (used as the `redirectTo` origin when calling `signInWithOAuth`).

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  page.tsx                  # Landing page
  dashboard/page.tsx        # Main dashboard (handle → stats + radar + recommendations)
  coach/page.tsx            # AI coaching chat
  problems/page.tsx         # Smart problem recommendations
  auth/page.tsx             # Sign in / sign up
  auth/callback/page.tsx    # OAuth callback handler
  api/
    codeforces/sync/        # Fetch + analyze Codeforces profile
    coach/                  # Problem metadata (GET) + streaming chat (POST)
    recommend/              # AI-ranked problem recommendations
    ai-summary/             # GPT-4o coaching summary

components/
  app-nav.tsx               # Shared sticky nav with auth state
  skill-radar-chart.tsx     # Recharts radar visualization
  cf-handle-form.tsx        # Inline analysis form on landing page

lib/
  analysis.ts               # Skill scoring engine (10 topics, logistic model)
  codeforces.ts             # CF API types and fetch helpers
  coach.ts                  # Shared types for coach feature
  openai.ts                 # OpenAI client
  supabase.ts               # Supabase browser client
```

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS v3**
- **Recharts** — radar chart
- **OpenAI SDK** — GPT-4o for coaching, recommendations, and summaries
- **Supabase JS v2** — auth (email + GitHub OAuth)
- **Codeforces public API** — submission history and problem data
