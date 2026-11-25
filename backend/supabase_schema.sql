-- Optional Supabase schema for persisting ClipForge AI projects and generated shorts
create table if not exists public.projects (
  id text primary key,
  title text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists public.clips (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  hook_title text not null,
  virality_score integer not null,
  reason text not null,
  start_time double precision not null,
  end_time double precision not null,
  hashtags text[] not null default '{}',
  video_url text,
  created_at timestamptz not null default now()
);
