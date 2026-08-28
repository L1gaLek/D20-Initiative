BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES app_users(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  scenario text NOT NULL DEFAULT '' CHECK (char_length(scenario) <= 200),
  password_hash text NOT NULL DEFAULT '',
  state jsonb,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rooms_one_owner_idx ON rooms(owner_id);

CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('GM', 'Player', 'Spectator')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS room_one_gm_idx
  ON room_members(room_id)
  WHERE role = 'GM';

CREATE TABLE IF NOT EXISTS room_bans (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES app_users(id),
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_bans ENABLE ROW LEVEL SECURITY;

-- The application backend connects with its server credential. Browser clients
-- receive no direct write policy; all mutations pass through server validation.

COMMIT;
