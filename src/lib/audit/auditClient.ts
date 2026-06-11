// Piste #13 v2 — Helper client fire-and-forget pour journaliser les actions.
// Jamais bloquant, jamais throw : un échec d'audit ne doit pas casser une action clinique.
import { recordAudit } from "@/lib/audit/audit.functions";
import type { AuditAction, AuditEntityType } from "@/lib/audit/actions";

export function audit(
  action: AuditAction,
  entityType?: AuditEntityType,
  entityId?: string,
  payload?: Record<string, unknown>,
): void {
  try {
    void recordAudit({
      data: {
        action,
        entityType,
        entityId,
        payload: payload ?? {},
      },
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[audit] échec enregistrement", action, err);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[audit] erreur synchrone", action, err);
  }
}
