CREATE TYPE "public"."act_source" AS ENUM('hf', 'lexuz');--> statement-breakpoint
CREATE TYPE "public"."act_status" AS ENUM('in_force', 'repealed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."act_type" AS ENUM('constitution', 'code', 'law', 'decree', 'resolution', 'order', 'other');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'ok', 'failed');--> statement-breakpoint
CREATE TABLE "law_acts" (
	"doc_id" text PRIMARY KEY NOT NULL,
	"act_group_id" text,
	"title" text NOT NULL,
	"act_type" "act_type" NOT NULL,
	"doc_number" text,
	"doc_date" date,
	"version_date" date,
	"status" "act_status" DEFAULT 'unknown' NOT NULL,
	"status_checked" boolean DEFAULT false NOT NULL,
	"core" boolean DEFAULT false NOT NULL,
	"language" text NOT NULL,
	"source_url" text NOT NULL,
	"source" "act_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "law_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"article_number" text,
	"part" text,
	"chapter" text,
	"title" text,
	"text" text NOT NULL,
	"text_norm" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"n_tokens" integer,
	"quality_flag" text,
	"language" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', text_norm)) STORED,
	"embedding" vector(1024)
);
--> statement-breakpoint
CREATE TABLE "law_sync_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "law_sync_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"acts_checked" integer DEFAULT 0 NOT NULL,
	"acts_updated" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "law_articles" ADD CONSTRAINT "law_articles_doc_id_law_acts_doc_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."law_acts"("doc_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "law_acts_type_status_core_idx" ON "law_acts" USING btree ("act_type","status","core");--> statement-breakpoint
CREATE INDEX "law_articles_doc_id_idx" ON "law_articles" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "law_articles_tsv_idx" ON "law_articles" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "law_articles_embedding_idx" ON "law_articles" USING hnsw ("embedding" vector_cosine_ops);