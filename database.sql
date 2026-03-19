-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Scope: Noble Dashboard Building 1 tables only.

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
  CONSTRAINT building1_parts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.building1_settings (
  id integer NOT NULL DEFAULT 1,
  working_days_per_week integer NOT NULL DEFAULT 5 CHECK (working_days_per_week >= 1 AND working_days_per_week <= 7),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamp with time zone DEFAULT now(),
  saturday_working boolean NOT NULL DEFAULT false,
  day_start_time text NOT NULL DEFAULT '08:00'::text,
  day_end_time text NOT NULL DEFAULT '17:00'::text,
  CONSTRAINT building1_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.building1_shifts (
  id bigint NOT NULL DEFAULT nextval('building1_shifts_id_seq'::regclass),
  shift_number integer NOT NULL UNIQUE,
  shift_name text NOT NULL DEFAULT 'Shift'::text,
  start_time text NOT NULL DEFAULT '08:00'::text,
  end_time text NOT NULL DEFAULT '16:00'::text,
  active_days jsonb NOT NULL DEFAULT '[0, 1, 2, 3, 4]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT building1_shifts_pkey PRIMARY KEY (id)
);

-- Proposed derived-cache table maintained by the app from building1_parts.
CREATE TABLE public.building1_active_parts (
  source_part_id bigint NOT NULL,
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
  location text,
  status text NOT NULL DEFAULT 'not_started'::text CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text])),
  sort_order integer DEFAULT 0,
  shift_preference integer CHECK (shift_preference IS NULL OR (shift_preference = ANY (ARRAY[1, 2, 3]))),
  k9_qty numeric DEFAULT NULL::numeric,
  k10_qty numeric DEFAULT NULL::numeric,
  k11_qty numeric DEFAULT NULL::numeric,
  unit_overrides jsonb,
  target_date date,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT building1_active_parts_pkey PRIMARY KEY (source_part_id),
  CONSTRAINT building1_active_parts_source_part_id_fkey FOREIGN KEY (source_part_id) REFERENCES public.building1_parts(id) ON DELETE CASCADE
);
