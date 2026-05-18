require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: (process.env.DB_SSL || "false").toLowerCase() === "true"
    ? { rejectUnauthorized: false }
    : false,
});

async function setup() {
  const client = await pool.connect();
  console.log("[setup] Connected to database:", process.env.DB_NAME);

  try {
    // ── Drop semua (urutan terbalik dari FK) ─────────────────────────
    console.log("[setup] Dropping existing objects...");
    await client.query(`
      DROP TABLE IF EXISTS
        public.user_summaries,
        public.session_topics,
        public.session_summaries,
        public.escalations,
        public.risk_flags,
        public.message_sensitive_words,
        public.sensitive_words,
        public.reports,
        public.messages,
        public.sessions,
        public.counselor_status,
        public.users,
        public.counselors
      CASCADE
    `);
    await client.query(`DROP TYPE IF EXISTS public.sender_type CASCADE`);
    await client.query(`DROP TYPE IF EXISTS public.risk_level CASCADE`);
    await client.query(`DROP TYPE IF EXISTS public.chat_session_status CASCADE`);
    console.log("[setup] Drop complete.");

    // ── Extension ─────────────────────────────────────────────────────
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`);

    // ── Types ─────────────────────────────────────────────────────────
    await client.query(`CREATE TYPE public.chat_session_status AS ENUM ('waiting','matched','active','closed')`);
    await client.query(`CREATE TYPE public.risk_level AS ENUM ('low','medium','high')`);
    await client.query(`CREATE TYPE public.sender_type AS ENUM ('user','counselor','system')`);
    console.log("[setup] Types created.");

    // ── Tables ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE public.counselors (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        name text,
        email text,
        specialization text,
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        display_name text,
        is_available boolean DEFAULT true NOT NULL,
        password_hash text
      )
    `);

    await client.query(`
      CREATE TABLE public.counselor_status (
        counselor_id uuid NOT NULL,
        is_available boolean DEFAULT true NOT NULL,
        max_sessions integer DEFAULT 3 NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE public.users (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        anon_handle text,
        username text,
        email text,
        password_hash text,
        role text NOT NULL DEFAULT 'user',
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT users_identity_check CHECK (
          (anon_handle IS NOT NULL) OR (username IS NOT NULL) OR (email IS NOT NULL)
        )
      )
    `);

    await client.query(`
      CREATE TABLE public.sessions (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL,
        topic text,
        status text DEFAULT 'waiting' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        counselor_id uuid,
        matched_at timestamp with time zone,
        closed_at timestamp with time zone
      )
    `);

    await client.query(`
      CREATE TABLE public.messages (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        sender public.sender_type NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        session_id uuid,
        body text,
        sender_id uuid
      )
    `);

    await client.query(`
      CREATE TABLE public.reports (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        reporter_user_id uuid,
        reporter_counselor_id uuid,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        session_id uuid,
        category text,
        detail text,
        status text DEFAULT 'open' NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE public.sensitive_words (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        word text NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE public.message_sensitive_words (
        message_id uuid NOT NULL,
        sensitive_word_id uuid NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE public.risk_flags (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        message_id uuid NOT NULL,
        level public.risk_level NOT NULL,
        score numeric(5,2) DEFAULT 0.00 NOT NULL,
        reasons text[],
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        session_id uuid
      )
    `);

    await client.query(`
      CREATE TABLE public.escalations (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        session_id uuid,
        message_id uuid,
        level text NOT NULL,
        status text DEFAULT 'open' NOT NULL,
        created_at timestamp with time zone DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE public.session_summaries (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        session_id uuid NOT NULL,
        ai_summary text NOT NULL,
        counselor_suggestion text,
        final_summary text,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE public.session_topics (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        session_id uuid,
        label text NOT NULL,
        confidence numeric(4,2) NOT NULL,
        created_at timestamp with time zone DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE public.user_summaries (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        user_id uuid NOT NULL,
        ai_summary text NOT NULL,
        counselor_suggestion text,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `);

    console.log("[setup] Tables created.");

    // ── Primary Keys / Unique ─────────────────────────────────────────
    await client.query(`ALTER TABLE ONLY public.counselors ADD CONSTRAINT counselors_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.counselors ADD CONSTRAINT counselors_email_key UNIQUE (email)`);
    await client.query(`ALTER TABLE ONLY public.counselor_status ADD CONSTRAINT counselor_status_pkey PRIMARY KEY (counselor_id)`);
    await client.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT users_anon_handle_key UNIQUE (anon_handle)`);
    await client.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT users_username_key UNIQUE (username)`);
    await client.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_key UNIQUE (email)`);
    await client.query(`ALTER TABLE ONLY public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.sensitive_words ADD CONSTRAINT sensitive_words_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.sensitive_words ADD CONSTRAINT sensitive_words_word_key UNIQUE (word)`);
    await client.query(`ALTER TABLE ONLY public.message_sensitive_words ADD CONSTRAINT message_sensitive_words_pkey PRIMARY KEY (message_id, sensitive_word_id)`);
    await client.query(`ALTER TABLE ONLY public.risk_flags ADD CONSTRAINT risk_flags_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.escalations ADD CONSTRAINT escalations_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.session_summaries ADD CONSTRAINT session_summaries_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.session_topics ADD CONSTRAINT session_topics_pkey PRIMARY KEY (id)`);
    await client.query(`ALTER TABLE ONLY public.user_summaries ADD CONSTRAINT user_summaries_pkey PRIMARY KEY (id)`);

    // ── Indexes ───────────────────────────────────────────────────────
    await client.query(`CREATE INDEX idx_messages_session_id ON public.messages USING btree (session_id)`);
    await client.query(`CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at)`);
    await client.query(`CREATE INDEX idx_risk_flags_level ON public.risk_flags USING btree (level)`);
    await client.query(`CREATE INDEX idx_risk_flags_message_id ON public.risk_flags USING btree (message_id)`);
    await client.query(`CREATE INDEX idx_risk_flags_session_id ON public.risk_flags USING btree (session_id)`);
    await client.query(`CREATE INDEX idx_sessions_counselor_id ON public.sessions USING btree (counselor_id)`);
    await client.query(`CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id)`);

    // ── Foreign Keys ──────────────────────────────────────────────────
    await client.query(`ALTER TABLE ONLY public.counselor_status ADD CONSTRAINT counselor_status_counselor_id_fkey FOREIGN KEY (counselor_id) REFERENCES public.counselors(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.sessions ADD CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.sessions ADD CONSTRAINT fk_sessions_counselor FOREIGN KEY (counselor_id) REFERENCES public.counselors(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ONLY public.messages ADD CONSTRAINT fk_messages_session FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.reports ADD CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_reporter_counselor_id_fkey FOREIGN KEY (reporter_counselor_id) REFERENCES public.counselors(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE ONLY public.reports ADD CONSTRAINT fk_reports_session FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.message_sensitive_words ADD CONSTRAINT message_sensitive_words_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.message_sensitive_words ADD CONSTRAINT message_sensitive_words_sensitive_word_id_fkey FOREIGN KEY (sensitive_word_id) REFERENCES public.sensitive_words(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.risk_flags ADD CONSTRAINT fk_risk_flags_message FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.risk_flags ADD CONSTRAINT fk_risk_flags_session FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.escalations ADD CONSTRAINT escalations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.escalations ADD CONSTRAINT escalations_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.session_summaries ADD CONSTRAINT session_summaries_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.session_topics ADD CONSTRAINT session_topics_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE`);
    await client.query(`ALTER TABLE ONLY public.user_summaries ADD CONSTRAINT user_summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`);

    console.log("[setup] Constraints and indexes created.");

    // ── Seed admin ────────────────────────────────────────────────────
    // password: 1234567890
    await client.query(`
      INSERT INTO public.users (username, email, password_hash, role)
      VALUES (
        'admin',
        'admin@healin.com',
        '$2b$10$VCtTO3xNC5LcGg45ApZZ2u56.YTHmRGcToXYK/dFGCFkRR05.SCCe',
        'admin'
      )
    `);
    console.log("[setup] Admin user seeded (username: admin, password: 1234567890)");

    console.log("[setup] ✓ Database setup complete!");
  } catch (e) {
    console.error("[setup] ERROR:", e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
