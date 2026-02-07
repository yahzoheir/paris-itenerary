-- Create table for tracking daily AI usage per user
create table if not exists public.ai_usage_daily (
  user_id uuid references auth.users(id) on delete cascade not null,
  day date not null,
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Enable RLS
alter table public.ai_usage_daily enable row level security;

-- Policies
create policy "Users can view their own usage"
  on public.ai_usage_daily for select
  using (auth.uid() = user_id);

create policy "Users can insert/update their own usage"
  on public.ai_usage_daily for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own usage" 
  on public.ai_usage_daily for update
  using (auth.uid() = user_id);
