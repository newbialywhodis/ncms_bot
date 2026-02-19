import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';

mkdirSync('./data', { recursive: true });

export const db = new Database('./data/bot.db', { create: true });

db.exec(`
  CREATE TABLE IF NOT EXISTS polls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT    NOT NULL,
    channel_id      TEXT    NOT NULL,
    message_id      TEXT,
    ping_message_id TEXT,
    scheduled_time  INTEGER NOT NULL,
    created_by      TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS poll_responses (
    poll_id      INTEGER NOT NULL,
    user_id      TEXT    NOT NULL,
    status       TEXT    NOT NULL CHECK(status IN ('present', 'absent')),
    responded_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS vacations (
    user_id  TEXT    NOT NULL,
    guild_id TEXT    NOT NULL,
    end_date TEXT    NOT NULL,
    set_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migracja: dodaj ping_message_id jeśli kolumna nie istnieje
const columns = db.prepare("PRAGMA table_info(polls)").all() as { name: string }[];
if (!columns.some((c) => c.name === 'ping_message_id')) {
  db.exec('ALTER TABLE polls ADD COLUMN ping_message_id TEXT');
}
