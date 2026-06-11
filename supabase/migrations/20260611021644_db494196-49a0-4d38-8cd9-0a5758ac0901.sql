ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'standard';
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_retention_class_check CHECK (retention_class IN ('standard','sensitive','permanent'));
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log(entity_type, entity_id);