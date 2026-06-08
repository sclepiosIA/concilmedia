
-- Helper trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- PATIENTS
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prenom text NOT NULL,
  date_naissance date,
  sexe text CHECK (sexe IN ('M','F','autre')),
  poids_kg numeric,
  taille_cm numeric,
  nir text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own patients" ON public.patients FOR ALL TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE TRIGGER trg_patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper to check ownership via patient
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = _patient_id AND p.created_by = auth.uid())
$$;

-- ALLERGIES
CREATE TABLE public.allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  substance text NOT NULL,
  reaction text,
  severite text CHECK (severite IN ('legere','moderee','severe','anaphylaxie')),
  date_apparition date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allergies TO authenticated;
GRANT ALL ON public.allergies TO service_role;
ALTER TABLE public.allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own allergies" ON public.allergies FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

-- ANTECEDENTS
CREATE TABLE public.antecedents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('medical','chirurgical','familial','obstetrical','autre')),
  description text NOT NULL,
  date_evenement date,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.antecedents TO authenticated;
GRANT ALL ON public.antecedents TO service_role;
ALTER TABLE public.antecedents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own antecedents" ON public.antecedents FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

-- COMORBIDITES
CREATE TABLE public.comorbidites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  libelle text NOT NULL,
  code_cim10 text,
  statut text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','resolu','suspect')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comorbidites TO authenticated;
GRANT ALL ON public.comorbidites TO service_role;
ALTER TABLE public.comorbidites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own comorbidites" ON public.comorbidites FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

-- TRAITEMENTS HABITUELS
CREATE TABLE public.traitements_habituels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dci text,
  nom_commercial text,
  dosage text,
  dosage_unite text,
  voie_administration text,
  posologie_matin text,
  posologie_midi text,
  posologie_soir text,
  posologie_coucher text,
  indication text,
  source text CHECK (source IN ('ordonnance','patient','MT','pharmacie','autre')),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traitements_habituels TO authenticated;
GRANT ALL ON public.traitements_habituels TO service_role;
ALTER TABLE public.traitements_habituels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own traitements" ON public.traitements_habituels FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));
CREATE TRIGGER trg_traitements_updated BEFORE UPDATE ON public.traitements_habituels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- EPISODES
CREATE TABLE public.episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  motif text,
  service text,
  date_entree timestamptz NOT NULL DEFAULT now(),
  date_sortie timestamptz,
  statut text NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert','clos')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.episodes TO authenticated;
GRANT ALL ON public.episodes TO service_role;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own episodes" ON public.episodes FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));
CREATE TRIGGER trg_episodes_updated BEFORE UPDATE ON public.episodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_episode(_episode_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.episodes e JOIN public.patients p ON p.id = e.patient_id WHERE e.id = _episode_id AND p.created_by = auth.uid())
$$;

-- PRESCRIPTIONS HOSPITALIERES
CREATE TABLE public.prescriptions_hospitalieres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medicament text NOT NULL,
  dosage text,
  posologie text,
  voie_administration text,
  date_debut timestamptz NOT NULL DEFAULT now(),
  date_fin timestamptz,
  prescripteur text,
  indication text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions_hospitalieres TO authenticated;
GRANT ALL ON public.prescriptions_hospitalieres TO service_role;
ALTER TABLE public.prescriptions_hospitalieres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prescriptions" ON public.prescriptions_hospitalieres FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

-- CONCILIATION
CREATE TABLE public.conciliation_medicaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('entree','sortie')),
  medication_domicile jsonb NOT NULL,
  medication_hospitalisation jsonb,
  type_divergence text NOT NULL CHECK (type_divergence IN ('omission','ajout','modification_dose','modification_freq','duplication','aucune')),
  intention text NOT NULL DEFAULT 'a_evaluer' CHECK (intention IN ('intentionnel','non_intentionnel','a_evaluer')),
  justification text,
  action_corrective text,
  statut text NOT NULL DEFAULT 'non_traite' CHECK (statut IN ('non_traite','en_cours','resolu','non_applicable')),
  pharmacien_id uuid REFERENCES auth.users(id),
  date_analyse timestamptz,
  date_validation timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliation_medicaments TO authenticated;
GRANT ALL ON public.conciliation_medicaments TO service_role;
ALTER TABLE public.conciliation_medicaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conciliation" ON public.conciliation_medicaments FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

-- IA ANALYSES
CREATE TABLE public.conciliation_ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliation_ai_analyses TO authenticated;
GRANT ALL ON public.conciliation_ai_analyses TO service_role;
ALTER TABLE public.conciliation_ai_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai analyses" ON public.conciliation_ai_analyses FOR ALL TO authenticated
  USING (public.owns_patient(patient_id)) WITH CHECK (public.owns_patient(patient_id));

CREATE INDEX idx_allergies_patient ON public.allergies(patient_id);
CREATE INDEX idx_antecedents_patient ON public.antecedents(patient_id);
CREATE INDEX idx_comorbidites_patient ON public.comorbidites(patient_id);
CREATE INDEX idx_traitements_patient ON public.traitements_habituels(patient_id);
CREATE INDEX idx_episodes_patient ON public.episodes(patient_id);
CREATE INDEX idx_prescriptions_episode ON public.prescriptions_hospitalieres(episode_id);
CREATE INDEX idx_conciliation_episode ON public.conciliation_medicaments(episode_id);
CREATE INDEX idx_ai_episode ON public.conciliation_ai_analyses(episode_id);
