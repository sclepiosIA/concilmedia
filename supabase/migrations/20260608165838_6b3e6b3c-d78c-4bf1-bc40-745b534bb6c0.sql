DELETE FROM public.comorbidites
WHERE libelle ILIKE '%fibrillation%'
  AND patient_id IN (SELECT id FROM public.patients WHERE nom='Martin' AND prenom='Jean');

DELETE FROM public.traitements_habituels
WHERE dci ILIKE 'apixaban%'
  AND patient_id IN (SELECT id FROM public.patients WHERE nom='Martin' AND prenom='Jean');

DELETE FROM public.conciliation_ai_analyses
WHERE patient_id IN (SELECT id FROM public.patients WHERE nom='Martin' AND prenom='Jean');

DELETE FROM public.risk_scores
WHERE episode_id IN (
  SELECT e.id FROM public.episodes e
  JOIN public.patients p ON p.id = e.patient_id
  WHERE p.nom='Martin' AND p.prenom='Jean'
);