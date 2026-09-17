-- ==============================================================================
-- Buy or Wait? — Supabase PostgreSQL Schema & Security Policies
-- ==============================================================================
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Account',
    home_currency TEXT NOT NULL DEFAULT 'USD',
    current_balance NUMERIC NOT NULL DEFAULT 5000.00,
    minimum_balance NUMERIC NOT NULL DEFAULT 1500.00,
    monthly_salary NUMERIC NOT NULL DEFAULT 3500.00,
    payday INTEGER NOT NULL DEFAULT 15,
    monthly_fixed_expenses NUMERIC NOT NULL DEFAULT 1200.00,
    financial_priorities TEXT[] DEFAULT ARRAY['emergency_savings', 'retirement'],
    expense_categories_to_protect TEXT[] DEFAULT ARRAY['rent', 'groceries', 'utilities', 'healthcare'],
    expense_categories_willing_to_reduce TEXT[] DEFAULT ARRAY['dining', 'shopping', 'entertainment'],
    expense_categories_willing_to_stop TEXT[] DEFAULT ARRAY['streaming', 'cloud_storage'],
    payment_methods TEXT[] DEFAULT ARRAY['full_payment', 'installments', 'partial_payment'],
    max_installment_months INTEGER DEFAULT 6,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. DECISIONS TABLE (Evaluation History)
CREATE TABLE IF NOT EXISTS public.decisions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    query TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    request_date DATE NOT NULL,
    desired_date DATE,
    allows_partial BOOLEAN NOT NULL DEFAULT false,
    uploaded_receipt_name TEXT,
    decision JSONB NOT NULL,
    profile_snapshot JSONB NOT NULL,
    trajectory JSONB
);

-- Index for fast lookup by user ordered by date
CREATE INDEX IF NOT EXISTS idx_decisions_user_created ON public.decisions(user_id, created_at DESC);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES
-- Profiles Policy: Users can only read, insert, and update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
    ON public.profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Decisions Policy: Users can only view, insert, and delete their own decisions
DROP POLICY IF EXISTS "Users can view own decisions" ON public.decisions;
CREATE POLICY "Users can view own decisions" 
    ON public.decisions FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own decisions" ON public.decisions;
CREATE POLICY "Users can insert own decisions" 
    ON public.decisions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own decisions" ON public.decisions;
CREATE POLICY "Users can delete own decisions" 
    ON public.decisions FOR DELETE 
    USING (auth.uid() = user_id);

-- 5. AUTO-CREATE PROFILE ON USER SIGNUP TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, home_currency, current_balance, minimum_balance)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        'USD',
        5000.00,
        1500.00
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
