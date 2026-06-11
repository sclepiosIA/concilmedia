// Piste #13 v2 — Whitelist centralisée des actions d'audit.
// Toute nouvelle action doit être ajoutée ici pour être autorisée côté UI.

export const AUDIT_ACTIONS = {
  // IA
  AI_ANALYSIS_RUN: "ai_analysis_run",
  AI_SYNTHESIS_RUN: "ai_synthesis_run",
  AI_LIAISON_LETTER_GENERATE: "ai_liaison_letter_generate",
  AI_RECONCILIATION_RUN: "ai_reconciliation_run",
  // Patient / DMP
  PATIENT_VIEW: "patient_view",
  DMP_CONSENT_UPDATE: "dmp_consent_update",
  DMP_HISTORY_VIEW: "dmp_history_view",
  // Épisode & conciliation
  EPISODE_VIEW: "episode_view",
  BMO_VALIDATE: "bmo_validate",
  SORTIE_VALIDATE: "sortie_validate",
  PRESCRIPTION_UPDATE: "prescription_update",
  // Exports
  EXPORT_PDF_LIAISON: "export_pdf_liaison",
  EXPORT_PDF_BMO: "export_pdf_bmo",
  EXPORT_CSV_METRICS: "export_csv_metrics",
  EXPORT_AUDIT_CSV: "export_audit_csv",
  EXPORT_AUDIT_SIGNED: "audit_export_signed",
  // Admin
  ROLE_GRANT: "role_grant",
  ROLE_REVOKE: "role_revoke",
  BDPM_REFRESH: "bdpm_refresh",
  RAG_INDEX_REBUILD: "rag_index_rebuild",
  // Évaluation modèles (piste #15)
  EVAL_DATASET_BUILD: "eval_dataset_build",
  EVAL_RUN_EXECUTE: "eval_run_execute",
  EVAL_REGRESSION_DETECTED: "eval_regression_detected",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITY_TYPES = {
  PATIENT: "patient",
  EPISODE: "episode",
  PRESCRIPTION: "prescription",
  ANALYSIS: "analysis",
  EXPORT: "export",
  ADMIN: "admin",
  EVAL_DATASET: "eval_dataset",
  EVAL_RUN: "eval_run",
} as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES];
