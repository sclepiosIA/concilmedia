
CREATE TABLE public.eval_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  task_slug text NOT NULL,
  description text,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_datasets TO authenticated;
GRANT ALL ON public.eval_datasets TO service_role;
ALTER TABLE public.eval_datasets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all eval_datasets" ON public.eval_datasets FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.eval_dataset_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.eval_datasets(id) ON DELETE CASCADE,
  ref_type text NOT NULL CHECK (ref_type IN ('ground_truth_dni','pharmacist_gold_standard','manual')),
  ref_id text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  weight real NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, ref_type, ref_id)
);
CREATE INDEX eval_dataset_items_dataset_idx ON public.eval_dataset_items(dataset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_dataset_items TO authenticated;
GRANT ALL ON public.eval_dataset_items TO service_role;
ALTER TABLE public.eval_dataset_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all eval_dataset_items" ON public.eval_dataset_items FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.eval_datasets(id) ON DELETE CASCADE,
  task_slug text NOT NULL,
  provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  n_items integer NOT NULL DEFAULT 0,
  n_ok integer NOT NULL DEFAULT 0,
  n_fail integer NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_eur numeric(12,6) NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eval_runs_task_model_idx ON public.eval_runs(task_slug, model, started_at DESC);
CREATE INDEX eval_runs_dataset_idx ON public.eval_runs(dataset_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_runs TO authenticated;
GRANT ALL ON public.eval_runs TO service_role;
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all eval_runs" ON public.eval_runs FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.eval_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
  dataset_item_id uuid NOT NULL REFERENCES public.eval_dataset_items(id) ON DELETE CASCADE,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  score jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  cost_eur numeric(12,6) NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eval_run_items_run_idx ON public.eval_run_items(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eval_run_items TO authenticated;
GRANT ALL ON public.eval_run_items TO service_role;
ALTER TABLE public.eval_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all eval_run_items" ON public.eval_run_items FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER eval_datasets_set_updated_at BEFORE UPDATE ON public.eval_datasets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
