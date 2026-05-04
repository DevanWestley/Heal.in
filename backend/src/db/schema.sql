-- =========================================
-- Schema: public
-- PostgreSQL create-from-scratch
-- =========================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- =========================================
-- Types
-- =========================================
CREATE TYPE public.chat_session_status AS ENUM (
    'waiting',
    'matched',
    'active',
    'closed'
);

CREATE TYPE public.risk_level AS ENUM (
    'low',
    'medium',
    'high'
);

CREATE TYPE public.sender_type AS ENUM (
    'user',
    'counselor',
    'system'
);

-- =========================================
-- Tables
-- =========================================
CREATE TABLE public.counselors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    email text,
    specialization text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    is_available boolean DEFAULT true NOT NULL
);

CREATE TABLE public.counselor_status (
    counselor_id uuid NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    max_sessions integer DEFAULT 3 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    anon_handle text,
    username text,
    email text,
    password_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_identity_check CHECK (((anon_handle IS NOT NULL) OR (username IS NOT NULL) OR (email IS NOT NULL)))
);

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic text,
    status text DEFAULT 'waiting'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    counselor_id uuid,
    matched_at timestamp with time zone,
    closed_at timestamp with time zone
);

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender public.sender_type NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    body text,
    sender_id uuid,
    CONSTRAINT messages_sender_check CHECK ((sender = ANY (ARRAY['user'::public.sender_type, 'counselor'::public.sender_type, 'system'::public.sender_type])))
);

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_user_id uuid,
    reporter_counselor_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    category text,
    detail text,
    status text DEFAULT 'open'::text NOT NULL
);

CREATE TABLE public.sensitive_words (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    word text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.message_sensitive_words (
    message_id uuid NOT NULL,
    sensitive_word_id uuid NOT NULL
);

CREATE TABLE public.risk_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    level public.risk_level NOT NULL,
    score numeric(5,2) DEFAULT 0.00 NOT NULL,
    reasons text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    CONSTRAINT risk_flags_level_check CHECK ((level = ANY (ARRAY['low'::public.risk_level, 'medium'::public.risk_level, 'high'::public.risk_level])))
);

CREATE TABLE public.escalations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    message_id uuid,
    level text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.session_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    ai_summary text NOT NULL,
    counselor_suggestion text,
    final_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.session_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    label text NOT NULL,
    confidence numeric(4,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ai_summary text NOT NULL,
    counselor_suggestion text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- =========================================
-- Primary Keys / Unique
-- =========================================
ALTER TABLE ONLY public.counselors
    ADD CONSTRAINT counselors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.counselors
    ADD CONSTRAINT counselors_email_key UNIQUE (email);

ALTER TABLE ONLY public.counselor_status
    ADD CONSTRAINT counselor_status_pkey PRIMARY KEY (counselor_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_anon_handle_key UNIQUE (anon_handle);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sensitive_words
    ADD CONSTRAINT sensitive_words_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sensitive_words
    ADD CONSTRAINT sensitive_words_word_key UNIQUE (word);

ALTER TABLE ONLY public.message_sensitive_words
    ADD CONSTRAINT message_sensitive_words_pkey PRIMARY KEY (message_id, sensitive_word_id);

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT risk_flags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_summaries
    ADD CONSTRAINT session_summaries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.session_topics
    ADD CONSTRAINT session_topics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_summaries
    ADD CONSTRAINT user_summaries_pkey PRIMARY KEY (id);

-- =========================================
-- Indexes
-- =========================================
CREATE INDEX idx_messages_session_id ON public.messages USING btree (session_id);
CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at);
CREATE INDEX idx_risk_flags_level ON public.risk_flags USING btree (level);
CREATE INDEX idx_risk_flags_message_id ON public.risk_flags USING btree (message_id);
CREATE INDEX idx_risk_flags_session_id ON public.risk_flags USING btree (session_id);
CREATE INDEX idx_sessions_counselor_id ON public.sessions USING btree (counselor_id);
CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);

-- =========================================
-- Foreign Keys
-- =========================================
ALTER TABLE ONLY public.counselor_status
    ADD CONSTRAINT counselor_status_counselor_id_fkey
    FOREIGN KEY (counselor_id) REFERENCES public.counselors(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_sessions_counselor
    FOREIGN KEY (counselor_id) REFERENCES public.counselors(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT fk_messages_session
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_reporter
    FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_user_id_fkey
    FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_counselor_id_fkey
    FOREIGN KEY (reporter_counselor_id) REFERENCES public.counselors(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT fk_reports_session
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_sensitive_words
    ADD CONSTRAINT message_sensitive_words_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_sensitive_words
    ADD CONSTRAINT message_sensitive_words_sensitive_word_id_fkey
    FOREIGN KEY (sensitive_word_id) REFERENCES public.sensitive_words(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT fk_risk_flags_message
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT risk_flags_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.risk_flags
    ADD CONSTRAINT fk_risk_flags_session
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.escalations
    ADD CONSTRAINT escalations_message_id_fkey
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.session_summaries
    ADD CONSTRAINT session_summaries_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.session_topics
    ADD CONSTRAINT session_topics_session_id_fkey
    FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_summaries
    ADD CONSTRAINT user_summaries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;