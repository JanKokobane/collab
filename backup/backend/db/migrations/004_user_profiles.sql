CREATE TABLE IF NOT EXISTS user_profiles (
    firebase_uid TEXT PRIMARY KEY,
    profile_image TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
