-- Phase 10: each row's heading (article title, or the act title for flat
-- acts) stored as its own indexed tsvector, instead of being parsed on every
-- search. A trigger fills it, so import/sync code never has to.
ALTER TABLE "law_articles" ADD COLUMN "heading_tsv" "tsvector";--> statement-breakpoint
CREATE OR REPLACE FUNCTION law_articles_heading() RETURNS trigger AS $$
BEGIN
  NEW.heading_tsv := to_tsvector('simple', lower(coalesce(
    NEW.title,
    (SELECT b.title FROM law_acts b WHERE b.doc_id = NEW.doc_id),
    ''
  )));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER law_articles_heading BEFORE INSERT OR UPDATE OF title, doc_id ON law_articles
  FOR EACH ROW EXECUTE FUNCTION law_articles_heading();--> statement-breakpoint
-- A renamed act renames the heading of its flat rows (those without a title).
CREATE OR REPLACE FUNCTION law_acts_heading() RETURNS trigger AS $$
BEGIN
  UPDATE law_articles SET heading_tsv = to_tsvector('simple', lower(NEW.title))
  WHERE doc_id = NEW.doc_id AND title IS NULL;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER law_acts_heading AFTER UPDATE OF title ON law_acts
  FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title) EXECUTE FUNCTION law_acts_heading();--> statement-breakpoint
-- Backfill rows that already exist (before the index, which is faster).
UPDATE law_articles a SET heading_tsv = to_tsvector('simple', lower(coalesce(a.title, b.title, '')))
FROM law_acts b WHERE b.doc_id = a.doc_id;--> statement-breakpoint
CREATE INDEX "law_articles_heading_tsv_idx" ON "law_articles" USING gin ("heading_tsv");
