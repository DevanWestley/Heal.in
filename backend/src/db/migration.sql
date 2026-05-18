-- Migration: Add password_hash to counselors table
ALTER TABLE public.counselors
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Migration: Add role column to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Seed default admin (username: admin, password: 1234567890)
INSERT INTO public.users (username, email, password_hash, role)
VALUES (
  'admin',
  'admin@healin.com',
  '$2b$10$VCtTO3xNC5LcGg45ApZZ2u56.YTHmRGcToXYK/dFGCFkRR05.SCCe',
  'admin'
)
ON CONFLICT (username) DO NOTHING;
