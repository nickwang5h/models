-- The one table behind src/count.mjs. Apply once: wrangler d1 execute models-counts --remote --file ops/counts.sql
CREATE TABLE IF NOT EXISTS counts (
  day    TEXT NOT NULL,              -- UTC date, YYYY-MM-DD
  kind   TEXT NOT NULL,              -- page | channel | feed | subscribe
  name   TEXT NOT NULL,              -- the path, the channel, the feed reader, or request | confirm
  source TEXT NOT NULL DEFAULT '',   -- the host the reader came from, or where the form was
  n      INTEGER NOT NULL DEFAULT 0, -- how many times
  top    INTEGER NOT NULL DEFAULT 0, -- feed only: the most subscribers the reader reported that day
  PRIMARY KEY (day, kind, name, source)
);
