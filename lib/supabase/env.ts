// Supabase project settings from .env.local (see .env.example). Both are public by design:
// the publishable key only grants what Row Level Security allows.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
