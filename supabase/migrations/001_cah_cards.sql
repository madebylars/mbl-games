-- CAH custom cards table
-- Run this in your Supabase SQL editor.
--
-- Cards added here are merged at runtime with the static JSON packs (base, swedish).
-- Pack names can be anything: "base", "swedish", or new custom pack names.

CREATE TABLE IF NOT EXISTS cah_cards (
  id         text        PRIMARY KEY,
  pack       text        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('black', 'white')),
  text       text        NOT NULL,
  pick       smallint    NOT NULL DEFAULT 1 CHECK (pick IN (1, 2, 3)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cah_cards_pack ON cah_cards (pack);

-- Row-level security
ALTER TABLE cah_cards ENABLE ROW LEVEL SECURITY;

-- Game server reads cards without auth (SELECT allowed for everyone)
CREATE POLICY "public read cah_cards"
  ON cah_cards FOR SELECT
  USING (true);

-- Only users with app_metadata.role = 'admin' can write
CREATE POLICY "admin insert cah_cards"
  ON cah_cards FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin update cah_cards"
  ON cah_cards FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "admin delete cah_cards"
  ON cah_cards FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
