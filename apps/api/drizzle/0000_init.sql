CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."agency_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."session_revoke_reason" AS ENUM('logout', 'reuse_detected', 'password_changed', 'admin_suspended');--> statement-breakpoint
CREATE TYPE "public"."email_code_purpose" AS ENUM('reset_password', 'set_password');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_name_length" CHECK (char_length(trim("agencies"."name")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"full_name" text NOT NULL,
	"phone" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"agency_id" uuid,
	"agency_role" "agency_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(trim("users"."email"))),
	CONSTRAINT "users_full_name_length" CHECK (char_length(trim("users"."full_name")) between 1 and 200),
	CONSTRAINT "users_agency_role_pair" CHECK (("users"."agency_id" is null) = ("users"."agency_role" is null))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"remember_me" boolean NOT NULL,
	"token_hash" text NOT NULL,
	"previous_token_hash" text,
	"rotated_at" timestamp with time zone,
	"user_agent" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" "session_revoke_reason",
	CONSTRAINT "sessions_idle_within_absolute" CHECK ("sessions"."idle_expires_at" <= "sessions"."absolute_expires_at"),
	CONSTRAINT "sessions_rotation_pair" CHECK (("sessions"."previous_token_hash" is null) = ("sessions"."rotated_at" is null)),
	CONSTRAINT "sessions_revoke_pair" CHECK (("sessions"."revoked_at" is null) = ("sessions"."revoked_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "email_codes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"purpose" "email_code_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "email_codes_attempts_range" CHECK ("email_codes"."attempts" between 0 and 5),
	CONSTRAINT "email_codes_expires_after_created" CHECK ("email_codes"."expires_at" > "email_codes"."created_at")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_agency_id_idx" ON "users" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");