ALTER TABLE "law_articles" ADD COLUMN "parent_id" text;--> statement-breakpoint
CREATE INDEX "law_articles_parent_id_idx" ON "law_articles" USING btree ("parent_id");