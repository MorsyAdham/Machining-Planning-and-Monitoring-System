-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.app_users (
  email text NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'user'::text])),
  CONSTRAINT app_users_pkey PRIMARY KEY (email)
);
CREATE TABLE public.assembly_audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  timestamp timestamp with time zone DEFAULT now(),
  user_id uuid,
  username text NOT NULL,
  user_role text,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  description text NOT NULL,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT assembly_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT assembly_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.assembly_plan (
  id bigint NOT NULL DEFAULT nextval('assembly_plan_id_seq'::regclass),
  vehicle text NOT NULL,
  vehicle_no text NOT NULL,
  process_station text NOT NULL,
  week text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  remark text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT assembly_plan_pkey PRIMARY KEY (id)
);
CREATE TABLE public.assembly_progress (
  id bigint NOT NULL DEFAULT nextval('assembly_progress_id_seq'::regclass),
  plan_id bigint NOT NULL UNIQUE,
  completed boolean NOT NULL DEFAULT false,
  completion_date date,
  notes text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  actual_start_date date,
  CONSTRAINT assembly_progress_pkey PRIMARY KEY (id),
  CONSTRAINT assembly_progress_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.assembly_plan(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text NOT NULL,
  action text NOT NULL,
  details text,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  table_name text,
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.building1_machines (
  id bigint NOT NULL DEFAULT nextval('building1_machines_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  machine_type text NOT NULL,
  num_shifts integer NOT NULL DEFAULT 1 CHECK (num_shifts >= 1 AND num_shifts <= 3),
  shift_hours numeric NOT NULL DEFAULT 8.0 CHECK (shift_hours > 0::numeric),
  capacity_percent integer NOT NULL DEFAULT 100 CHECK (capacity_percent >= 1 AND capacity_percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  active_shifts jsonb,
  building_id integer NOT NULL DEFAULT 1,
  CONSTRAINT building1_machines_pkey PRIMARY KEY (id)
);
CREATE TABLE public.building1_parts (
  id bigint NOT NULL DEFAULT nextval('building1_parts_id_seq'::regclass),
  part_number text NOT NULL,
  part_name text NOT NULL,
  setup_hrs numeric NOT NULL DEFAULT 0,
  mach_hrs numeric NOT NULL DEFAULT 0,
  op_hrs numeric NOT NULL DEFAULT 0,
  k9 text,
  k10 text,
  k11 text,
  battalion_qty integer NOT NULL DEFAULT 0,
  remaining_qty numeric NOT NULL DEFAULT 0,
  started_qty numeric NOT NULL DEFAULT 0,
  location text,
  created_at timestamp with time zone DEFAULT now(),
  status text NOT NULL DEFAULT 'not_started'::text CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text])),
  sort_order integer DEFAULT 0,
  shift_preference integer CHECK (shift_preference IS NULL OR (shift_preference = ANY (ARRAY[1, 2, 3]))),
  k9_qty numeric DEFAULT NULL::numeric,
  k10_qty numeric DEFAULT NULL::numeric,
  k11_qty numeric DEFAULT NULL::numeric,
  unit_overrides jsonb,
  target_date date,
  building_id integer NOT NULL DEFAULT 1,
  preferred_machine_id bigint,
  CONSTRAINT building1_parts_pkey PRIMARY KEY (id),
  CONSTRAINT building1_parts_preferred_machine_id_fkey FOREIGN KEY (preferred_machine_id) REFERENCES public.building1_machines(id)
);
CREATE TABLE public.building1_settings (
  id integer NOT NULL DEFAULT 1,
  working_days_per_week integer NOT NULL DEFAULT 5 CHECK (working_days_per_week >= 1 AND working_days_per_week <= 7),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamp with time zone DEFAULT now(),
  saturday_working boolean NOT NULL DEFAULT false,
  day_start_time text NOT NULL DEFAULT '08:00'::text,
  day_end_time text NOT NULL DEFAULT '17:00'::text,
  building_id integer NOT NULL DEFAULT 1,
  time_unit text NOT NULL DEFAULT 'h'::text CHECK (time_unit = ANY (ARRAY['h'::text, 'min'::text])),
  production_sequence jsonb,
  CONSTRAINT building1_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.building1_shifts (
  id bigint NOT NULL DEFAULT nextval('building1_shifts_id_seq'::regclass),
  shift_number integer NOT NULL,
  shift_name text NOT NULL DEFAULT 'Shift'::text,
  start_time text NOT NULL DEFAULT '08:00'::text,
  end_time text NOT NULL DEFAULT '16:00'::text,
  active_days jsonb NOT NULL DEFAULT '[0, 1, 2, 3, 4]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  building_id integer NOT NULL DEFAULT 1,
  CONSTRAINT building1_shifts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.edit_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id bigint NOT NULL,
  column_name text,
  old_value text,
  new_value text,
  edited_by uuid,
  edited_by_email text,
  edited_at timestamp with time zone DEFAULT now(),
  CONSTRAINT edit_history_pkey PRIMARY KEY (id),
  CONSTRAINT edit_history_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES auth.users(id)
);
CREATE TABLE public.inspection_boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shipment text NOT NULL,
  NO bigint NOT NULL,
  ContainerNum text,
  BoxNum text,
  Container text,
  BoxName text,
  ItemCount bigint,
  Kits text,
  Factory text,
  REMARKS text,
  CompletionDate date,
  updated_at timestamp with time zone DEFAULT now(),
  Discrepancies text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inspection_boxes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inspection_boxes_backup (
  id uuid,
  shipment text,
  NO bigint,
  ContainerNum text,
  BoxNum text,
  Container text,
  BoxName text,
  ItemCount bigint,
  Kits text,
  Factory text,
  REMARKS text,
  CompletionDate date,
  updated_at timestamp without time zone,
  Discrepancies text
);
CREATE TABLE public.jan_2026_inspection_boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shipment text NOT NULL,
  NO bigint NOT NULL,
  ContainerNum text,
  BoxNum text,
  container text,
  BoxName text,
  ItemCount bigint,
  Kits text,
  Factory text,
  REMARKS text,
  CompletionDate date,
  updated_at timestamp with time zone DEFAULT now(),
  Discrepancies text,
  created_at timestamp with time zone DEFAULT now(),
  Container text,
  CONSTRAINT jan_2026_inspection_boxes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  part_no text NOT NULL,
  loc text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT locations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mar_2026_inspection_boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shipment text NOT NULL,
  NO bigint NOT NULL,
  ContainerNum text,
  BoxNum text,
  container text,
  BoxName text,
  ItemCount bigint,
  Kits text,
  Factory text,
  REMARKS text,
  CompletionDate date,
  updated_at timestamp with time zone DEFAULT now(),
  Discrepancies text,
  created_at timestamp with time zone DEFAULT now(),
  Container text,
  CONSTRAINT mar_2026_inspection_boxes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.planning_app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['master_admin'::text, 'admin'::text, 'planner'::text, 'viewer'::text])),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT planning_app_users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.planning_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text NOT NULL,
  user_role text NOT NULL,
  action text NOT NULL,
  table_name text,
  record_id text,
  data_before jsonb,
  data_after jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT planning_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT planning_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.planning_app_users(id)
);
CREATE TABLE public.production_status (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  vehicle_number text NOT NULL,
  station_code text NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT production_status_pkey PRIMARY KEY (id),
  CONSTRAINT fk_vehicle FOREIGN KEY (vehicle_number) REFERENCES public.vehicles(vehicle_number)
);
CREATE TABLE public.requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  vehicle_type text NOT NULL CHECK (vehicle_type = ANY (ARRAY['K9'::text, 'K10'::text, 'K11'::text])),
  vehicle_number text NOT NULL,
  station_code text NOT NULL,
  part_number text,
  qty integer CHECK (qty >= 0),
  request_type text NOT NULL CHECK (request_type = ANY (ARRAY['station'::text, 'part'::text])),
  fastener boolean DEFAULT false,
  request_date timestamp without time zone DEFAULT now(),
  delivery_date timestamp without time zone,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'delivered'::text])),
  requested_by text NOT NULL,
  comments text,
  CONSTRAINT requests_pkey PRIMARY KEY (id),
  CONSTRAINT fk_vehicle_request FOREIGN KEY (vehicle_number) REFERENCES public.vehicles(vehicle_number)
);
CREATE TABLE public.stations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  vehicle_type text NOT NULL CHECK (vehicle_type = ANY (ARRAY['K9'::text, 'K10'::text, 'K11'::text])),
  station_code text NOT NULL,
  CONSTRAINT stations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.telegram_config (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  bot_token text NOT NULL,
  chat_id text NOT NULL,
  enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT telegram_config_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'viewer'::text])),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['admin'::text, 'viewer'::text])),
  email text UNIQUE,
  approved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['master_admin'::text, 'admin'::text, 'viewer'::text, 'customer'::text])),
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vehicle_units (
  id bigint NOT NULL DEFAULT nextval('vehicle_units_id_seq'::regclass),
  vehicle text NOT NULL,
  vehicle_no text NOT NULL,
  unit_code text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_units_pkey PRIMARY KEY (id)
);
CREATE TABLE public.vehicles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  vehicle_type text NOT NULL CHECK (vehicle_type = ANY (ARRAY['K9'::text, 'K10'::text, 'K11'::text])),
  vehicle_number text NOT NULL UNIQUE,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT vehicles_pkey PRIMARY KEY (id)
);
