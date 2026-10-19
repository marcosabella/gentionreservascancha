-- Pura Vida: schema only, no customer records, users, or configuration rows.
-- Source: zcixnnzxxkylotbjudhk. Intended destination: qsvdpdifygmzdawxfyqv.
-- Existing source access policies are preserved; this is not a security remediation.
-- Import is atomic and refuses a destination with existing public tables or users.
BEGIN;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Destination public schema must be empty';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Destination authentication users must be empty';
  END IF;
END;
$guard$;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_all_users"() RETURNS TABLE("id" "uuid", "email" "text", "phone" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.phone,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_first_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
user_count integer;
BEGIN
SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE role = 'admin';

IF user_count = 0 AND NEW.role = 'admin' THEN
UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';
END IF;

RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_first_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."make_first_user_admin"() RETURNS TABLE("success" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
first_user_id uuid;
admin_count integer;
BEGIN
SELECT COUNT(*) INTO admin_count FROM public.user_profiles WHERE role = 'admin' AND is_active = true;

IF admin_count > 0 THEN
RETURN QUERY SELECT false, 'Admin user already exists'::text;
RETURN;
END IF;

SELECT id INTO first_user_id
FROM public.user_profiles
ORDER BY created_at ASC
LIMIT 1;

IF first_user_id IS NULL THEN
RETURN QUERY SELECT false, 'No users found'::text;
RETURN;
END IF;

UPDATE public.user_profiles
SET role = 'admin', is_active = true, updated_at = now()
WHERE id = first_user_id;

UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';

RETURN QUERY SELECT true, 'First user promoted to admin'::text;
END;
$$;


ALTER FUNCTION "public"."make_first_user_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_profile_last_login"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  profile_id uuid;
  metadata_profile_id text;
begin
  if new.last_sign_in_at is null then
    return new;
  end if;

  if old.last_sign_in_at is not null and old.last_sign_in_at = new.last_sign_in_at then
    return new;
  end if;

  metadata_profile_id := nullif(new.raw_user_meta_data ->> 'profile_id', '');
  profile_id := case
    when metadata_profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then metadata_profile_id::uuid
    else new.id
  end;

  update public.user_profiles
  set
    last_login = new.last_sign_in_at,
    updated_at = now()
  where id = profile_id;

  return new;
end;
$_$;


ALTER FUNCTION "public"."sync_user_profile_last_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_schedule_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_schedule_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_profiles_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."booking_consumptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "consumable_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "split_between_players" boolean DEFAULT true,
    "assigned_to_players" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."booking_consumptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "player_id" "uuid",
    "player_name" "text" NOT NULL,
    "player_email" "text" NOT NULL,
    "player_phone" "text" NOT NULL,
    "is_organizer" boolean DEFAULT false,
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_splits" "jsonb",
    CONSTRAINT "booking_players_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text", 'current_account'::"text"])))
);


ALTER TABLE "public"."booking_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "court_id" "uuid",
    "court_name" "text" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "total_price" integer DEFAULT 0 NOT NULL,
    "final_total" integer,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "is_recurring" boolean DEFAULT false,
    "recurring_booking_id" "uuid",
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'pending'::"text", 'cancelled'::"text", 'in-progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumable_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "label" "text" NOT NULL,
    "color" "text" DEFAULT 'blue'::"text" NOT NULL,
    "default_icon" "text" DEFAULT 'Package'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consumable_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price" integer DEFAULT 0 NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "available" boolean DEFAULT true,
    "icon" "text" DEFAULT 'Package'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."consumables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."court_unavailabilities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "court_id" "uuid" NOT NULL,
    "court_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "reason" "text" DEFAULT 'other'::"text" NOT NULL,
    "date" "date",
    "day_of_week" integer,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "court_unavailabilities_date_or_day" CHECK (((("is_recurring" = false) AND ("date" IS NOT NULL) AND ("day_of_week" IS NULL)) OR (("is_recurring" = true) AND ("date" IS NULL) AND ("day_of_week" IS NOT NULL)))),
    CONSTRAINT "court_unavailabilities_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "court_unavailabilities_reason_check" CHECK (("reason" = ANY (ARRAY['class'::"text", 'closed'::"text", 'maintenance'::"text", 'other'::"text"]))),
    CONSTRAINT "court_unavailabilities_time_order" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."court_unavailabilities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "price_per_turn" integer DEFAULT 0 NOT NULL,
    "features" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "start_time" "text" DEFAULT '08:00'::"text" NOT NULL,
    "end_time" "text" DEFAULT '22:00'::"text" NOT NULL
);


ALTER TABLE "public"."courts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."current_account_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid",
    "type" "text" NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "related_booking_id" "uuid",
    "related_sale_id" "uuid",
    "payment_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "current_account_entries_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text"]))),
    CONSTRAINT "current_account_entries_type_check" CHECK (("type" = ANY (ARRAY['debit'::"text", 'credit'::"text"])))
);


ALTER TABLE "public"."current_account_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "total_bookings" integer DEFAULT 0,
    "last_booking" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "gender" "text",
    "category" integer
);


ALTER TABLE "public"."players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid",
    "player_name" "text" NOT NULL,
    "court_id" "uuid",
    "court_name" "text" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_active" boolean DEFAULT true,
    "skip_dates" "date"[] DEFAULT '{}'::"date"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "recurring_bookings_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."recurring_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid",
    "consumable_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "subtotal" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone NOT NULL,
    "customer_type" "text" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_email" "text",
    "customer_phone" "text",
    "total_amount" integer DEFAULT 0 NOT NULL,
    "payment_method" "text" NOT NULL,
    "notes" "text",
    "booking_id" "uuid",
    "court_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sales_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['registered'::"text", 'guest'::"text"]))),
    CONSTRAINT "sales_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text", 'current_account'::"text"]))),
    CONSTRAINT "sales_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'booking'::"text"])))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "start_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "end_time" time without time zone DEFAULT '22:00:00'::time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."schedule_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "is_sensitive" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "pairs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "zones" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "playoff_rounds" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "matches" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "player_id" "uuid",
    "role" "text" DEFAULT 'player'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "username" "text",
    "password_hash" "text",
    "password_updated_at" timestamp with time zone,
    "last_login" timestamp with time zone,
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'player'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."booking_consumptions"
    ADD CONSTRAINT "booking_consumptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_players"
    ADD CONSTRAINT "booking_players_booking_id_player_id_key" UNIQUE ("booking_id", "player_id");



ALTER TABLE ONLY "public"."booking_players"
    ADD CONSTRAINT "booking_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumable_categories"
    ADD CONSTRAINT "consumable_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."consumable_categories"
    ADD CONSTRAINT "consumable_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumables"
    ADD CONSTRAINT "consumables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."court_unavailabilities"
    ADD CONSTRAINT "court_unavailabilities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."current_account_entries"
    ADD CONSTRAINT "current_account_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_settings"
    ADD CONSTRAINT "schedule_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");



CREATE INDEX "court_unavailabilities_court_date_idx" ON "public"."court_unavailabilities" USING "btree" ("court_id", "date", "start_time");



CREATE INDEX "court_unavailabilities_court_day_idx" ON "public"."court_unavailabilities" USING "btree" ("court_id", "day_of_week", "start_time") WHERE ("is_recurring" = true);



CREATE INDEX "idx_booking_players_booking" ON "public"."booking_players" USING "btree" ("booking_id");



CREATE INDEX "idx_booking_players_player" ON "public"."booking_players" USING "btree" ("player_id");



CREATE INDEX "idx_bookings_court_date" ON "public"."bookings" USING "btree" ("court_id", "date");



CREATE INDEX "idx_bookings_date" ON "public"."bookings" USING "btree" ("date");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "idx_current_account_player" ON "public"."current_account_entries" USING "btree" ("player_id");



CREATE INDEX "idx_recurring_bookings_active" ON "public"."recurring_bookings" USING "btree" ("is_active");



CREATE INDEX "idx_sales_date" ON "public"."sales" USING "btree" ("date");



CREATE OR REPLACE TRIGGER "handle_first_admin_trigger" AFTER INSERT ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_first_admin"();



CREATE OR REPLACE TRIGGER "update_bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_consumable_categories_updated_at" BEFORE UPDATE ON "public"."consumable_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_consumables_updated_at" BEFORE UPDATE ON "public"."consumables" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courts_updated_at" BEFORE UPDATE ON "public"."courts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_players_updated_at" BEFORE UPDATE ON "public"."players" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_recurring_bookings_updated_at" BEFORE UPDATE ON "public"."recurring_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_schedule_settings_updated_at" BEFORE UPDATE ON "public"."schedule_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_schedule_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_profiles_updated_at"();



ALTER TABLE ONLY "public"."booking_consumptions"
    ADD CONSTRAINT "booking_consumptions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_players"
    ADD CONSTRAINT "booking_players_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_players"
    ADD CONSTRAINT "booking_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."court_unavailabilities"
    ADD CONSTRAINT "court_unavailabilities_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."current_account_entries"
    ADD CONSTRAINT "current_account_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."current_account_entries"
    ADD CONSTRAINT "current_account_entries_related_booking_id_fkey" FOREIGN KEY ("related_booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."current_account_entries"
    ADD CONSTRAINT "current_account_entries_related_sale_id_fkey" FOREIGN KEY ("related_sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_court_id_fkey" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_bookings"
    ADD CONSTRAINT "recurring_bookings_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."players"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create profiles" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"text") AND ("up"."is_active" = true)))));



CREATE POLICY "Admins can delete profiles" ON "public"."user_profiles" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"text") AND ("up"."is_active" = true)))));



CREATE POLICY "Admins can update profiles" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"text") AND ("up"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"text") AND ("up"."is_active" = true)))));



CREATE POLICY "Admins can view all profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"text") AND ("up"."is_active" = true)))));



CREATE POLICY "Allow all deletes" ON "public"."booking_consumptions" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."booking_players" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."bookings" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."consumable_categories" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."consumables" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."courts" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."current_account_entries" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."players" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."recurring_bookings" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."sale_items" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."sales" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."schedule_settings" FOR DELETE USING (true);



CREATE POLICY "Allow all deletes" ON "public"."user_profiles" FOR DELETE USING (true);



CREATE POLICY "Allow all inserts" ON "public"."booking_consumptions" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."booking_players" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."bookings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."consumable_categories" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."consumables" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."courts" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."current_account_entries" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."players" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."recurring_bookings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."sale_items" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."sales" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."schedule_settings" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all inserts" ON "public"."user_profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow all selects" ON "public"."booking_consumptions" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."booking_players" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."bookings" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."consumable_categories" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."consumables" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."courts" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."current_account_entries" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."players" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."recurring_bookings" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."sale_items" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."sales" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."schedule_settings" FOR SELECT USING (true);



CREATE POLICY "Allow all selects" ON "public"."user_profiles" FOR SELECT USING (true);



CREATE POLICY "Allow all updates" ON "public"."booking_consumptions" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."booking_players" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."bookings" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."consumable_categories" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."consumables" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."courts" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."current_account_entries" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."players" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."recurring_bookings" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."sale_items" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."sales" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."schedule_settings" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow all updates" ON "public"."user_profiles" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can manage tournaments" ON "public"."tournaments" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can read tournaments" ON "public"."tournaments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "System config accessible to service role only" ON "public"."system_config" USING (false) WITH CHECK (false);



CREATE POLICY "Users can read own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."booking_consumptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consumable_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consumables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."court_unavailabilities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "court_unavailabilities_manage_authenticated" ON "public"."court_unavailabilities" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "court_unavailabilities_select_authenticated" ON "public"."court_unavailabilities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."courts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."current_account_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT ALL ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_first_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_first_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_first_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."make_first_user_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."make_first_user_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."make_first_user_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_profile_last_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_profile_last_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_profile_last_login"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_schedule_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_schedule_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_schedule_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_profiles_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."booking_consumptions" TO "anon";
GRANT ALL ON TABLE "public"."booking_consumptions" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_consumptions" TO "service_role";



GRANT ALL ON TABLE "public"."booking_players" TO "anon";
GRANT ALL ON TABLE "public"."booking_players" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_players" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."consumable_categories" TO "anon";
GRANT ALL ON TABLE "public"."consumable_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."consumable_categories" TO "service_role";



GRANT ALL ON TABLE "public"."consumables" TO "anon";
GRANT ALL ON TABLE "public"."consumables" TO "authenticated";
GRANT ALL ON TABLE "public"."consumables" TO "service_role";



GRANT ALL ON TABLE "public"."court_unavailabilities" TO "anon";
GRANT ALL ON TABLE "public"."court_unavailabilities" TO "authenticated";
GRANT ALL ON TABLE "public"."court_unavailabilities" TO "service_role";



GRANT ALL ON TABLE "public"."courts" TO "anon";
GRANT ALL ON TABLE "public"."courts" TO "authenticated";
GRANT ALL ON TABLE "public"."courts" TO "service_role";



GRANT ALL ON TABLE "public"."current_account_entries" TO "anon";
GRANT ALL ON TABLE "public"."current_account_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."current_account_entries" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_bookings" TO "anon";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_bookings" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_settings" TO "anon";
GRANT ALL ON TABLE "public"."schedule_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_settings" TO "service_role";



GRANT ALL ON TABLE "public"."system_config" TO "anon";
GRANT ALL ON TABLE "public"."system_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_config" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








SET LOCAL search_path = public, pg_catalog;
CREATE OR REPLACE FUNCTION public.get_all_users()
 RETURNS TABLE(id uuid, email text, phone text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.phone,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_first_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
user_count integer;
BEGIN
-- Count existing user_profiles
SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE role = 'admin';

-- If this is the first admin being created, mark it
IF user_count = 0 AND NEW.role = 'admin' THEN
UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';
END IF;

RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.make_first_user_admin()
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
first_user_id uuid;
admin_count integer;
BEGIN
-- Check if admin already exists
SELECT COUNT(*) INTO admin_count FROM public.user_profiles WHERE role = 'admin' AND is_active = true;

IF admin_count > 0 THEN
RETURN QUERY SELECT false, 'Admin user already exists'::text;
RETURN;
END IF;

-- Get the first created user
SELECT id INTO first_user_id
FROM public.user_profiles
ORDER BY created_at ASC
LIMIT 1;

IF first_user_id IS NULL THEN
RETURN QUERY SELECT false, 'No users found'::text;
RETURN;
END IF;

-- Make them admin
UPDATE public.user_profiles
SET role = 'admin', is_active = true, updated_at = now()
WHERE id = first_user_id;

-- Update system config
UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';

RETURN QUERY SELECT true, 'First user promoted to admin'::text;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_profile_last_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  profile_id uuid;
  metadata_profile_id text;
begin
  if new.last_sign_in_at is null then
    return new;
  end if;

  if old.last_sign_in_at is not null and old.last_sign_in_at = new.last_sign_in_at then
    return new;
  end if;

  metadata_profile_id := nullif(new.raw_user_meta_data ->> 'profile_id', '');
  profile_id := case
    when metadata_profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then metadata_profile_id::uuid
    else new.id
  end;

  update public.user_profiles
  set
    last_login = new.last_sign_in_at,
    updated_at = now()
  where id = profile_id;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_schedule_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER sync_user_profile_last_login_on_auth_users AFTER UPDATE OF last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION sync_user_profile_last_login();

-- Verify that no rows were imported or generated by the schema deployment.
DO $verify$
DECLARE
  target_table record;
  row_count bigint;
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 16 THEN
    RAISE EXCEPTION 'Unexpected application table count';
  END IF;
  FOR target_table IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', target_table.tablename) INTO row_count;
    IF row_count <> 0 THEN
      RAISE EXCEPTION 'Unexpected records in table %', target_table.tablename;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Unexpected authentication users';
  END IF;
END;
$verify$;
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
