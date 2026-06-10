import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { logConciliationEvent } from "@/lib/metrics/events.functions";

type Step =
  | "open_patient" | "open_episode" | "recueil_atcd" | "recueil_traitements"
  | "comparaison" | "analyse_ia" | "validation" | "cloture";

interface Options {
  step: Step;
  patientId?: string;
  episodeId?: string;
  metadata?: Record<string, unknown>;
  /** N'enregistre rien si la durée totale active est < ce seuil (ms). */
  minDurationMs?: number;
  /** Délai d'inactivité (ms) avant de geler le compteur. */
  idleAfterMs?: number;
}

const INACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ["mousemove", "keydown", "click", "scroll"];

/**
 * Mesure le temps actif passé sur une étape du workflow.
 * - Compte uniquement quand l'onglet est visible et qu'il y a eu une interaction < idleAfterMs.
 * - Pose `enter` au mount, `exit` au unmount (via sendBeacon si dispo).
 */
export function useConciliationTimer(opts: Options) {
  const log = useServerFn(logConciliationEvent);
  const startedAtRef = useRef<number | null>(null);
  const activeMsRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const sentExitRef = useRef<boolean>(false);

  const minDuration = opts.minDurationMs ?? 2000;
  const idleAfter = opts.idleAfterMs ?? 60_000;

  useEffect(() => {
    sentExitRef.current = false;
    startedAtRef.current = performance.now();
    activeMsRef.current = 0;
    lastActivityRef.current = Date.now();

    log({ data: { step: opts.step, kind: "enter", patientId: opts.patientId, episodeId: opts.episodeId, metadata: opts.metadata } })
      .catch(() => { /* silent */ });

    const onActivity = () => { lastActivityRef.current = Date.now(); };
    INACTIVITY_EVENTS.forEach((ev) => document.addEventListener(ev, onActivity, { passive: true }));

    let lastTick = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastTick;
      lastTick = now;
      const idle = Date.now() - lastActivityRef.current;
      if (document.visibilityState === "visible" && idle < idleAfter) {
        activeMsRef.current += delta;
      }
    }, 1000);

    const sendExit = () => {
      if (sentExitRef.current) return;
      sentExitRef.current = true;
      const duration = Math.round(activeMsRef.current);
      if (duration < minDuration) return;
      // Try sendBeacon (fire-and-forget, survives unload)
      try {
        log({ data: { step: opts.step, kind: "exit", patientId: opts.patientId, episodeId: opts.episodeId, durationMs: duration, metadata: opts.metadata } })
          .catch(() => { /* silent */ });
      } catch { /* ignore */ }
    };

    const onUnload = () => sendExit();
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.clearInterval(interval);
      INACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, onActivity));
      window.removeEventListener("beforeunload", onUnload);
      sendExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.step, opts.patientId, opts.episodeId]);
}

/** Enregistre un événement "action" ponctuel (validation, déclenchement IA, etc.). */
export function useLogAction() {
  const log = useServerFn(logConciliationEvent);
  return (params: { step: Step; patientId?: string; episodeId?: string; durationMs?: number; metadata?: Record<string, unknown> }) =>
    log({ data: { ...params, kind: "action" } }).catch(() => { /* silent */ });
}
