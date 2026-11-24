CREATE TABLE entries (page INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, pen TEXT NOT NULL, chapter TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, details TEXT NOT NULL, media TEXT NOT NULL, opens TEXT, created TEXT NOT NULL, owner TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX entries_visible ON entries(hidden, page);
--> statement-breakpoint
CREATE TABLE replies (id TEXT PRIMARY KEY, entry TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, parent TEXT REFERENCES replies(id) ON DELETE CASCADE, pen TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE INDEX replies_entry ON replies(entry,created);
--> statement-breakpoint
CREATE TABLE hearts (entry TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, visitor TEXT NOT NULL, PRIMARY KEY(entry,visitor));
--> statement-breakpoint
CREATE TABLE reports (id TEXT PRIMARY KEY, entry TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE, reply TEXT REFERENCES replies(id) ON DELETE CASCADE, reason TEXT NOT NULL, created TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL);
