CREATE TABLE "legal_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" "message_status" DEFAULT 'done' NOT NULL,
	"answer" jsonb,
	"language" "ai_language",
	"reply_to_message_id" uuid,
	"error" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_chats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"agency_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legal_chat_messages" ADD CONSTRAINT "legal_chat_messages_chat_id_legal_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."legal_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_chats" ADD CONSTRAINT "legal_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_chats" ADD CONSTRAINT "legal_chats_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_chat_messages_chat_id_idx" ON "legal_chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "legal_chats_user_id_idx" ON "legal_chats" USING btree ("user_id","updated_at");