export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_feedback_signals: {
        Row: {
          analysis_id: string
          category: string
          comment: string | null
          created_at: string
          decision: string
          had_override: boolean
          human_payload: Json | null
          id: string
          item_index: number
          llm_payload: Json | null
          model: string | null
          patient_id: string
          pharmacien_id: string | null
          severity_corrected: string | null
          severity_original: string | null
          task_slug: string
          validation_id: string
        }
        Insert: {
          analysis_id: string
          category: string
          comment?: string | null
          created_at?: string
          decision: string
          had_override?: boolean
          human_payload?: Json | null
          id?: string
          item_index: number
          llm_payload?: Json | null
          model?: string | null
          patient_id: string
          pharmacien_id?: string | null
          severity_corrected?: string | null
          severity_original?: string | null
          task_slug?: string
          validation_id: string
        }
        Update: {
          analysis_id?: string
          category?: string
          comment?: string | null
          created_at?: string
          decision?: string
          had_override?: boolean
          human_payload?: Json | null
          id?: string
          item_index?: number
          llm_payload?: Json | null
          model?: string | null
          patient_id?: string
          pharmacien_id?: string | null
          severity_corrected?: string | null
          severity_original?: string | null
          task_slug?: string
          validation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_signals_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "conciliation_ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_signals_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "conciliation_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_tokens: number | null
          model: string
          note: string | null
          provider_id: string | null
          system_prompt: string
          task_id: string
          temperature: number | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_tokens?: number | null
          model: string
          note?: string | null
          provider_id?: string | null
          system_prompt: string
          task_id: string
          temperature?: number | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_tokens?: number | null
          model?: string
          note?: string | null
          provider_id?: string | null
          system_prompt?: string
          task_id?: string
          temperature?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_versions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string | null
          base_url: string | null
          created_at: string
          extra_config: Json
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          extra_config?: Json
          id?: string
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string | null
          created_at?: string
          extra_config?: Json
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_tasks: {
        Row: {
          created_at: string
          current_version: number
          description: string | null
          execution_mode: string
          extra_config: Json
          id: string
          label: string
          max_tokens: number | null
          model: string
          provider_id: string | null
          slug: string
          system_prompt: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          description?: string | null
          execution_mode?: string
          extra_config?: Json
          id?: string
          label: string
          max_tokens?: number | null
          model: string
          provider_id?: string | null
          slug: string
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version?: number
          description?: string | null
          execution_mode?: string
          extra_config?: Json
          id?: string
          label?: string
          max_tokens?: number | null
          model?: string
          provider_id?: string | null
          slug?: string
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tasks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      allergies: {
        Row: {
          created_at: string
          date_apparition: string | null
          id: string
          notes: string | null
          patient_id: string
          reaction: string | null
          severite: string | null
          source_document_id: string | null
          substance: string
        }
        Insert: {
          created_at?: string
          date_apparition?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          reaction?: string | null
          severite?: string | null
          source_document_id?: string | null
          substance: string
        }
        Update: {
          created_at?: string
          date_apparition?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          reaction?: string | null
          severite?: string | null
          source_document_id?: string | null
          substance?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergies_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      antecedents: {
        Row: {
          actif: boolean
          created_at: string
          date_evenement: string | null
          description: string
          id: string
          patient_id: string
          source_document_id: string | null
          type: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          date_evenement?: string | null
          description: string
          id?: string
          patient_id: string
          source_document_id?: string | null
          type: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          date_evenement?: string | null
          description?: string
          id?: string
          patient_id?: string
          source_document_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "antecedents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "antecedents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          hash: string
          id: string
          payload: Json
          prev_hash: string | null
          retention_class: string
          seq: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hash: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          retention_class?: string
          seq?: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hash?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          retention_class?: string
          seq?: number
          user_id?: string | null
        }
        Relationships: []
      }
      bdpm_atc: {
        Row: {
          cis: number
          code_atc: string
          libelle_atc: string | null
        }
        Insert: {
          cis: number
          code_atc: string
          libelle_atc?: string | null
        }
        Update: {
          cis?: number
          code_atc?: string
          libelle_atc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bdpm_atc_cis_fkey"
            columns: ["cis"]
            isOneToOne: true
            referencedRelation: "bdpm_specialites"
            referencedColumns: ["cis"]
          },
        ]
      }
      bdpm_compositions: {
        Row: {
          cis: number
          code_substance: number | null
          denomination_substance: string | null
          designation_element_pharma: string | null
          dosage_substance: string | null
          id: number
          nature_composant: string | null
          reference_dosage: string | null
        }
        Insert: {
          cis: number
          code_substance?: number | null
          denomination_substance?: string | null
          designation_element_pharma?: string | null
          dosage_substance?: string | null
          id?: number
          nature_composant?: string | null
          reference_dosage?: string | null
        }
        Update: {
          cis?: number
          code_substance?: number | null
          denomination_substance?: string | null
          designation_element_pharma?: string | null
          dosage_substance?: string | null
          id?: number
          nature_composant?: string | null
          reference_dosage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bdpm_compositions_cis_fkey"
            columns: ["cis"]
            isOneToOne: false
            referencedRelation: "bdpm_specialites"
            referencedColumns: ["cis"]
          },
        ]
      }
      bdpm_import_runs: {
        Row: {
          error: string | null
          files_processed: Json | null
          finished_at: string | null
          id: string
          rows_total: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          error?: string | null
          files_processed?: Json | null
          finished_at?: string | null
          id?: string
          rows_total?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          error?: string | null
          files_processed?: Json | null
          finished_at?: string | null
          id?: string
          rows_total?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      bdpm_presentations: {
        Row: {
          agrement_collectivites: boolean | null
          cip13: number | null
          cip7: number
          cis: number
          date_declaration_commerc: string | null
          etat_commercialisation: string | null
          libelle: string | null
          prix_eur: number | null
          statut_admin: string | null
          taux_remboursement: string | null
        }
        Insert: {
          agrement_collectivites?: boolean | null
          cip13?: number | null
          cip7: number
          cis: number
          date_declaration_commerc?: string | null
          etat_commercialisation?: string | null
          libelle?: string | null
          prix_eur?: number | null
          statut_admin?: string | null
          taux_remboursement?: string | null
        }
        Update: {
          agrement_collectivites?: boolean | null
          cip13?: number | null
          cip7?: number
          cis?: number
          date_declaration_commerc?: string | null
          etat_commercialisation?: string | null
          libelle?: string | null
          prix_eur?: number | null
          statut_admin?: string | null
          taux_remboursement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bdpm_presentations_cis_fkey"
            columns: ["cis"]
            isOneToOne: false
            referencedRelation: "bdpm_specialites"
            referencedColumns: ["cis"]
          },
        ]
      }
      bdpm_specialites: {
        Row: {
          cis: number
          date_amm: string | null
          denomination: string
          etat_commercialisation: string | null
          forme: string | null
          statut_amm: string | null
          surveillance_renforcee: boolean | null
          titulaire: string | null
          type_amm: string | null
          updated_at: string
          voies: string | null
        }
        Insert: {
          cis: number
          date_amm?: string | null
          denomination: string
          etat_commercialisation?: string | null
          forme?: string | null
          statut_amm?: string | null
          surveillance_renforcee?: boolean | null
          titulaire?: string | null
          type_amm?: string | null
          updated_at?: string
          voies?: string | null
        }
        Update: {
          cis?: number
          date_amm?: string | null
          denomination?: string
          etat_commercialisation?: string | null
          forme?: string | null
          statut_amm?: string | null
          surveillance_renforcee?: boolean | null
          titulaire?: string | null
          type_amm?: string | null
          updated_at?: string
          voies?: string | null
        }
        Relationships: []
      }
      biologie_resultats: {
        Row: {
          created_at: string
          date_prelevement: string | null
          id: string
          parametre: string
          patient_id: string
          source: string
          source_document_id: string | null
          unite: string | null
          valeur: number | null
          valeur_texte: string | null
        }
        Insert: {
          created_at?: string
          date_prelevement?: string | null
          id?: string
          parametre: string
          patient_id: string
          source?: string
          source_document_id?: string | null
          unite?: string | null
          valeur?: number | null
          valeur_texte?: string | null
        }
        Update: {
          created_at?: string
          date_prelevement?: string | null
          id?: string
          parametre?: string
          patient_id?: string
          source?: string
          source_document_id?: string | null
          unite?: string | null
          valeur?: number | null
          valeur_texte?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "biologie_resultats_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "biologie_resultats_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_evaluations: {
        Row: {
          cohort_id: string
          computed_at: string
          computed_by: string
          id: string
          metrics_ia: Json | null
          metrics_ml: Json | null
          model_label: string | null
          per_patient: Json | null
          run_tag: string | null
        }
        Insert: {
          cohort_id: string
          computed_at?: string
          computed_by: string
          id?: string
          metrics_ia?: Json | null
          metrics_ml?: Json | null
          model_label?: string | null
          per_patient?: Json | null
          run_tag?: string | null
        }
        Update: {
          cohort_id?: string
          computed_at?: string
          computed_by?: string
          id?: string
          metrics_ia?: Json | null
          metrics_ml?: Json | null
          model_label?: string | null
          per_patient?: Json | null
          run_tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_evaluations_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string | null
          tag: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          label?: string | null
          tag: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          tag?: string
          updated_at?: string
        }
        Relationships: []
      }
      comorbidites: {
        Row: {
          code_cim10: string | null
          created_at: string
          id: string
          libelle: string
          patient_id: string
          source_document_id: string | null
          statut: string
        }
        Insert: {
          code_cim10?: string | null
          created_at?: string
          id?: string
          libelle: string
          patient_id: string
          source_document_id?: string | null
          statut?: string
        }
        Update: {
          code_cim10?: string | null
          created_at?: string
          id?: string
          libelle?: string
          patient_id?: string
          source_document_id?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "comorbidites_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comorbidites_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliation_ai_analyses: {
        Row: {
          analysis_type: string
          created_at: string
          episode_id: string | null
          id: string
          model: string
          model_label: string | null
          patient_id: string
          payload: Json
          run_tag: string | null
          source: string
        }
        Insert: {
          analysis_type?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          model: string
          model_label?: string | null
          patient_id: string
          payload: Json
          run_tag?: string | null
          source?: string
        }
        Update: {
          analysis_type?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          model?: string
          model_label?: string | null
          patient_id?: string
          payload?: Json
          run_tag?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliation_ai_analyses_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_ai_analyses_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliation_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          episode_id: string | null
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          organization_id: string | null
          patient_id: string | null
          step: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          episode_id?: string | null
          id?: string
          kind: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          patient_id?: string | null
          step: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          episode_id?: string | null
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string | null
          patient_id?: string | null
          step?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliation_events_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliation_medicaments: {
        Row: {
          action_corrective: string | null
          classe_atc: string | null
          created_at: string
          date_analyse: string | null
          date_validation: string | null
          episode_id: string
          gravite: string | null
          id: string
          intention: string
          is_synthetic: boolean
          justification: string | null
          medication_domicile: Json
          medication_hospitalisation: Json | null
          patient_id: string
          pharmacien_id: string | null
          phase: string
          statut: string
          type_divergence: string
        }
        Insert: {
          action_corrective?: string | null
          classe_atc?: string | null
          created_at?: string
          date_analyse?: string | null
          date_validation?: string | null
          episode_id: string
          gravite?: string | null
          id?: string
          intention?: string
          is_synthetic?: boolean
          justification?: string | null
          medication_domicile: Json
          medication_hospitalisation?: Json | null
          patient_id: string
          pharmacien_id?: string | null
          phase: string
          statut?: string
          type_divergence: string
        }
        Update: {
          action_corrective?: string | null
          classe_atc?: string | null
          created_at?: string
          date_analyse?: string | null
          date_validation?: string | null
          episode_id?: string
          gravite?: string | null
          id?: string
          intention?: string
          is_synthetic?: boolean
          justification?: string | null
          medication_domicile?: Json
          medication_hospitalisation?: Json | null
          patient_id?: string
          pharmacien_id?: string | null
          phase?: string
          statut?: string
          type_divergence?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliation_medicaments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_medicaments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliation_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_user_id: string | null
          id: string
          motif: string | null
          organization_id: string | null
          patient_id: string
          to_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          from_user_id?: string | null
          id?: string
          motif?: string | null
          organization_id?: string | null
          patient_id: string
          to_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          from_user_id?: string | null
          id?: string
          motif?: string | null
          organization_id?: string | null
          patient_id?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliation_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_transfers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliation_validations: {
        Row: {
          analysis_id: string
          commentaire_global: string | null
          id: string
          item_decisions: Json
          patient_id: string
          pharmacien_nom: string | null
          updated_at: string
          validated_at: string
          validated_by: string
        }
        Insert: {
          analysis_id: string
          commentaire_global?: string | null
          id?: string
          item_decisions?: Json
          patient_id: string
          pharmacien_nom?: string | null
          updated_at?: string
          validated_at?: string
          validated_by: string
        }
        Update: {
          analysis_id?: string
          commentaire_global?: string | null
          id?: string
          item_decisions?: Json
          patient_id?: string
          pharmacien_nom?: string | null
          updated_at?: string
          validated_at?: string
          validated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliation_validations_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "conciliation_ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliation_validations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      data_imports: {
        Row: {
          errors: Json | null
          file_kind: string
          finished_at: string | null
          id: string
          imported_by: string
          organization_id: string
          rows_inserted: number
          rows_rejected: number
          rows_total: number
          source_filename: string | null
          source_sha256: string
          started_at: string
          status: string
        }
        Insert: {
          errors?: Json | null
          file_kind: string
          finished_at?: string | null
          id?: string
          imported_by: string
          organization_id: string
          rows_inserted?: number
          rows_rejected?: number
          rows_total?: number
          source_filename?: string | null
          source_sha256: string
          started_at?: string
          status?: string
        }
        Update: {
          errors?: Json | null
          file_kind?: string
          finished_at?: string | null
          id?: string
          imported_by?: string
          organization_id?: string
          rows_inserted?: number
          rows_rejected?: number
          rows_total?: number
          source_filename?: string | null
          source_sha256?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discharge_letters: {
        Row: {
          comparison_json: Json
          created_at: string
          created_by: string | null
          delivery_channel: string | null
          delivery_log: Json
          episode_id: string
          id: string
          letter_html: string | null
          letter_text: string | null
          organization_id: string | null
          parent_letter_id: string | null
          patient_id: string
          recipient_medecin_mssante: string | null
          recipient_medecin_nom: string | null
          recipient_pharmacien_mssante: string | null
          recipient_pharmacien_nom: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          version: number
        }
        Insert: {
          comparison_json?: Json
          created_at?: string
          created_by?: string | null
          delivery_channel?: string | null
          delivery_log?: Json
          episode_id: string
          id?: string
          letter_html?: string | null
          letter_text?: string | null
          organization_id?: string | null
          parent_letter_id?: string | null
          patient_id: string
          recipient_medecin_mssante?: string | null
          recipient_medecin_nom?: string | null
          recipient_pharmacien_mssante?: string | null
          recipient_pharmacien_nom?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          version?: number
        }
        Update: {
          comparison_json?: Json
          created_at?: string
          created_by?: string | null
          delivery_channel?: string | null
          delivery_log?: Json
          episode_id?: string
          id?: string
          letter_html?: string | null
          letter_text?: string | null
          organization_id?: string | null
          parent_letter_id?: string | null
          patient_id?: string
          recipient_medecin_mssante?: string | null
          recipient_medecin_nom?: string | null
          recipient_pharmacien_mssante?: string | null
          recipient_pharmacien_nom?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "discharge_letters_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_letters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_letters_parent_letter_id_fkey"
            columns: ["parent_letter_id"]
            isOneToOne: false
            referencedRelation: "discharge_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discharge_letters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      dmp_access_audit: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          motif: string | null
          patient_id: string
          resource: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          motif?: string | null
          patient_id: string
          resource?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          motif?: string | null
          patient_id?: string
          resource?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dmp_access_audit_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      dmp_hmd_imports: {
        Row: {
          created_at: string
          id: string
          imported_at: string
          imported_by: string | null
          lines: Json
          notes: string | null
          organization_id: string | null
          patient_id: string
          period_end: string | null
          period_start: string | null
          reconciliation: Json
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          lines?: Json
          notes?: string | null
          organization_id?: string | null
          patient_id: string
          period_end?: string | null
          period_start?: string | null
          reconciliation?: Json
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          lines?: Json
          notes?: string | null
          organization_id?: string | null
          patient_id?: string
          period_end?: string | null
          period_start?: string | null
          reconciliation?: Json
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmp_hmd_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmp_hmd_imports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_sources: {
        Row: {
          created_at: string
          document_type: string | null
          episode_id: string | null
          file_name: string
          file_size: number | null
          hash_sha256: string | null
          id: string
          mime_type: string
          patient_id: string
          prescriber_name: string | null
          prescriber_specialty: string | null
          prescription_date: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          episode_id?: string | null
          file_name: string
          file_size?: number | null
          hash_sha256?: string | null
          id?: string
          mime_type: string
          patient_id: string
          prescriber_name?: string | null
          prescriber_specialty?: string | null
          prescription_date?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string | null
          episode_id?: string | null
          file_name?: string
          file_size?: number | null
          hash_sha256?: string | null
          id?: string
          mime_type?: string
          patient_id?: string
          prescriber_name?: string | null
          prescriber_specialty?: string | null
          prescription_date?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_sources_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sources_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          autonomie_gir: number | null
          bilan_entree_completed_at: string | null
          bmo_notes: string | null
          bmo_sources: string[] | null
          cohort_id: string | null
          contexte_social: string | null
          created_at: string
          date_entree: string
          date_sortie: string | null
          discharge_conciliation_completed_at: string | null
          etat_general: string | null
          eva_douleur: number | null
          external_ref: string | null
          fc: number | null
          fr: number | null
          id: string
          mode_admission: string | null
          motif: string | null
          observance_habituelle: string | null
          patient_id: string
          poids_entree_kg: number | null
          provenance: string | null
          service: string | null
          spo2: number | null
          statut: string
          ta_diastolique: number | null
          ta_systolique: number | null
          taille_entree_cm: number | null
          temperature: number | null
          updated_at: string
          via_urgences: boolean
        }
        Insert: {
          autonomie_gir?: number | null
          bilan_entree_completed_at?: string | null
          bmo_notes?: string | null
          bmo_sources?: string[] | null
          cohort_id?: string | null
          contexte_social?: string | null
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          discharge_conciliation_completed_at?: string | null
          etat_general?: string | null
          eva_douleur?: number | null
          external_ref?: string | null
          fc?: number | null
          fr?: number | null
          id?: string
          mode_admission?: string | null
          motif?: string | null
          observance_habituelle?: string | null
          patient_id: string
          poids_entree_kg?: number | null
          provenance?: string | null
          service?: string | null
          spo2?: number | null
          statut?: string
          ta_diastolique?: number | null
          ta_systolique?: number | null
          taille_entree_cm?: number | null
          temperature?: number | null
          updated_at?: string
          via_urgences?: boolean
        }
        Update: {
          autonomie_gir?: number | null
          bilan_entree_completed_at?: string | null
          bmo_notes?: string | null
          bmo_sources?: string[] | null
          cohort_id?: string | null
          contexte_social?: string | null
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          discharge_conciliation_completed_at?: string | null
          etat_general?: string | null
          eva_douleur?: number | null
          external_ref?: string | null
          fc?: number | null
          fr?: number | null
          id?: string
          mode_admission?: string | null
          motif?: string | null
          observance_habituelle?: string | null
          patient_id?: string
          poids_entree_kg?: number | null
          provenance?: string | null
          service?: string | null
          spo2?: number | null
          statut?: string
          ta_diastolique?: number | null
          ta_systolique?: number | null
          taille_entree_cm?: number | null
          temperature?: number | null
          updated_at?: string
          via_urgences?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "episodes_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_dataset_items: {
        Row: {
          created_at: string
          dataset_id: string
          expected: Json
          id: string
          input: Json
          ref_id: string | null
          ref_type: string
          weight: number
        }
        Insert: {
          created_at?: string
          dataset_id: string
          expected?: Json
          id?: string
          input?: Json
          ref_id?: string | null
          ref_type: string
          weight?: number
        }
        Update: {
          created_at?: string
          dataset_id?: string
          expected?: Json
          id?: string
          input?: Json
          ref_id?: string | null
          ref_type?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "eval_dataset_items_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "eval_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_datasets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          item_count: number
          slug: string
          task_slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          item_count?: number
          slug: string
          task_slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          item_count?: number
          slug?: string
          task_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      eval_run_items: {
        Row: {
          cost_eur: number
          created_at: string
          dataset_item_id: string
          error: string | null
          id: string
          latency_ms: number | null
          output: Json
          run_id: string
          score: Json
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_eur?: number
          created_at?: string
          dataset_item_id: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          output?: Json
          run_id: string
          score?: Json
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_eur?: number
          created_at?: string
          dataset_item_id?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          output?: Json
          run_id?: string
          score?: Json
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_run_items_dataset_item_id_fkey"
            columns: ["dataset_item_id"]
            isOneToOne: false
            referencedRelation: "eval_dataset_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          cost_eur: number
          created_at: string
          dataset_id: string
          finished_at: string | null
          id: string
          metrics: Json
          model: string
          n_fail: number
          n_items: number
          n_ok: number
          provider_id: string | null
          started_at: string
          status: string
          task_slug: string
          total_tokens: number
          triggered_by: string | null
        }
        Insert: {
          cost_eur?: number
          created_at?: string
          dataset_id: string
          finished_at?: string | null
          id?: string
          metrics?: Json
          model: string
          n_fail?: number
          n_items?: number
          n_ok?: number
          provider_id?: string | null
          started_at?: string
          status?: string
          task_slug: string
          total_tokens?: number
          triggered_by?: string | null
        }
        Update: {
          cost_eur?: number
          created_at?: string
          dataset_id?: string
          finished_at?: string | null
          id?: string
          metrics?: Json
          model?: string
          n_fail?: number
          n_items?: number
          n_ok?: number
          provider_id?: string | null
          started_at?: string
          status?: string
          task_slug?: string
          total_tokens?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "eval_datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      fhir_push_logs: {
        Row: {
          created_at: string
          endpoint_url: string
          id: string
          ok: boolean
          organization_id: string
          pushed_by: string | null
          resource_counts: Json
          response_excerpt: string | null
          status_code: number | null
          validation_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint_url: string
          id?: string
          ok?: boolean
          organization_id: string
          pushed_by?: string | null
          resource_counts?: Json
          response_excerpt?: string | null
          status_code?: number | null
          validation_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint_url?: string
          id?: string
          ok?: boolean
          organization_id?: string
          pushed_by?: string | null
          resource_counts?: Json
          response_excerpt?: string | null
          status_code?: number | null
          validation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fhir_push_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fhir_push_logs_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "conciliation_validations"
            referencedColumns: ["id"]
          },
        ]
      }
      ground_truth_dnis: {
        Row: {
          created_at: string
          created_by: string
          episode_id: string
          expected_intention: string
          id: string
          medicament: string
          notes: string | null
          type_divergence: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          episode_id: string
          expected_intention?: string
          id?: string
          medicament: string
          notes?: string | null
          type_divergence: string
        }
        Update: {
          created_at?: string
          created_by?: string
          episode_id?: string
          expected_intention?: string
          id?: string
          medicament?: string
          notes?: string | null
          type_divergence?: string
        }
        Relationships: [
          {
            foreignKeyName: "ground_truth_dnis_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      hmd_adherence_snapshots: {
        Row: {
          computed_at: string
          created_by: string | null
          discrepancies: Json
          id: string
          import_id: string | null
          items: Json
          patient_id: string
          summary: Json
          window_months: number
        }
        Insert: {
          computed_at?: string
          created_by?: string | null
          discrepancies?: Json
          id?: string
          import_id?: string | null
          items?: Json
          patient_id: string
          summary?: Json
          window_months?: number
        }
        Update: {
          computed_at?: string
          created_by?: string | null
          discrepancies?: Json
          id?: string
          import_id?: string | null
          items?: Json
          patient_id?: string
          summary?: Json
          window_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "hmd_adherence_snapshots_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "dmp_hmd_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hmd_adherence_snapshots_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      mes_pushes: {
        Row: {
          ack_id: string | null
          document_id: string | null
          document_type: string
          episode_id: string | null
          error_message: string | null
          id: string
          patient_id: string
          payload_hash: string | null
          payload_summary: Json
          pushed_at: string
          pushed_by: string | null
          status: string
        }
        Insert: {
          ack_id?: string | null
          document_id?: string | null
          document_type: string
          episode_id?: string | null
          error_message?: string | null
          id?: string
          patient_id: string
          payload_hash?: string | null
          payload_summary?: Json
          pushed_at?: string
          pushed_by?: string | null
          status?: string
        }
        Update: {
          ack_id?: string | null
          document_id?: string | null
          document_type?: string
          episode_id?: string | null
          error_message?: string | null
          id?: string
          patient_id?: string
          payload_hash?: string | null
          payload_summary?: Json
          pushed_at?: string
          pushed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mes_pushes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mes_pushes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organization_id: string
          role: string
          service: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id: string
          role: string
          service?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string
          role?: string
          service?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_sih_config: {
        Row: {
          auth_kind: string
          auth_secret_encrypted: string | null
          created_at: string
          fhir_base_url: string | null
          id: string
          ins_oid: string | null
          ipp_authority_oid: string | null
          is_active: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          auth_kind?: string
          auth_secret_encrypted?: string | null
          created_at?: string
          fhir_base_url?: string | null
          id?: string
          ins_oid?: string | null
          ipp_authority_oid?: string | null
          is_active?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          auth_kind?: string
          auth_secret_encrypted?: string | null
          created_at?: string
          fhir_base_url?: string | null
          id?: string
          ins_oid?: string | null
          ipp_authority_oid?: string | null
          is_active?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_sih_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          fhir_ingest_secret_encrypted: string | null
          finess: string | null
          hds_provider: string | null
          id: string
          nom: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fhir_ingest_secret_encrypted?: string | null
          finess?: string | null
          hds_provider?: string | null
          id?: string
          nom: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fhir_ingest_secret_encrypted?: string | null
          finess?: string | null
          hds_provider?: string | null
          id?: string
          nom?: string
          updated_at?: string
        }
        Relationships: []
      }
      patients: {
        Row: {
          archived: boolean
          assigned_to: string | null
          cohort_id: string | null
          cohort_tag: string | null
          consentement_dmp: boolean
          consentement_dmp_date: string | null
          consentement_dmp_recueilli_par: string | null
          created_at: string
          created_by: string
          data_source: string
          date_naissance: string | null
          date_offset_days: number | null
          external_pseudo: string | null
          external_ref: string | null
          id: string
          imported_via: string | null
          ins_pseudo: string | null
          ipp_authority_oid: string | null
          is_synthetic: boolean
          medecin_traitant_mssante: string | null
          medecin_traitant_nom: string | null
          nir: string | null
          nom: string
          notes: string | null
          organization_id: string | null
          pharmacien_officine_mssante: string | null
          pharmacien_officine_nom: string | null
          poids_kg: number | null
          prenom: string
          service: string | null
          sexe: string | null
          taille_cm: number | null
          updated_at: string
          workflow_status: string
        }
        Insert: {
          archived?: boolean
          assigned_to?: string | null
          cohort_id?: string | null
          cohort_tag?: string | null
          consentement_dmp?: boolean
          consentement_dmp_date?: string | null
          consentement_dmp_recueilli_par?: string | null
          created_at?: string
          created_by: string
          data_source?: string
          date_naissance?: string | null
          date_offset_days?: number | null
          external_pseudo?: string | null
          external_ref?: string | null
          id?: string
          imported_via?: string | null
          ins_pseudo?: string | null
          ipp_authority_oid?: string | null
          is_synthetic?: boolean
          medecin_traitant_mssante?: string | null
          medecin_traitant_nom?: string | null
          nir?: string | null
          nom: string
          notes?: string | null
          organization_id?: string | null
          pharmacien_officine_mssante?: string | null
          pharmacien_officine_nom?: string | null
          poids_kg?: number | null
          prenom: string
          service?: string | null
          sexe?: string | null
          taille_cm?: number | null
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          archived?: boolean
          assigned_to?: string | null
          cohort_id?: string | null
          cohort_tag?: string | null
          consentement_dmp?: boolean
          consentement_dmp_date?: string | null
          consentement_dmp_recueilli_par?: string | null
          created_at?: string
          created_by?: string
          data_source?: string
          date_naissance?: string | null
          date_offset_days?: number | null
          external_pseudo?: string | null
          external_ref?: string | null
          id?: string
          imported_via?: string | null
          ins_pseudo?: string | null
          ipp_authority_oid?: string | null
          is_synthetic?: boolean
          medecin_traitant_mssante?: string | null
          medecin_traitant_nom?: string | null
          nir?: string | null
          nom?: string
          notes?: string | null
          organization_id?: string | null
          pharmacien_officine_mssante?: string | null
          pharmacien_officine_nom?: string | null
          poids_kg?: number | null
          prenom?: string
          service?: string | null
          sexe?: string | null
          taille_cm?: number | null
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_imported_via_fkey"
            columns: ["imported_via"]
            isOneToOne: false
            referencedRelation: "data_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacist_conciliation_documents: {
        Row: {
          analysis_id: string
          compared_at: string | null
          comparison_payload: Json | null
          created_at: string
          episode_id: string | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string
          patient_id: string
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          analysis_id: string
          compared_at?: string | null
          comparison_payload?: Json | null
          created_at?: string
          episode_id?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type: string
          patient_id: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          analysis_id?: string
          compared_at?: string | null
          comparison_payload?: Json | null
          created_at?: string
          episode_id?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string
          patient_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pharmacist_conciliation_documents_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "conciliation_ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacist_conciliation_documents_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacist_conciliation_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacist_gold_standards: {
        Row: {
          cohort_id: string | null
          created_at: string
          episode_id: string | null
          extracted_json: Json | null
          file_name: string
          id: string
          mime_type: string | null
          nb_divergences: number | null
          patient_id: string
          storage_path: string
          triage_complexe: boolean | null
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          episode_id?: string | null
          extracted_json?: Json | null
          file_name: string
          id?: string
          mime_type?: string | null
          nb_divergences?: number | null
          patient_id: string
          storage_path: string
          triage_complexe?: boolean | null
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          episode_id?: string | null
          extracted_json?: Json | null
          file_name?: string
          id?: string
          mime_type?: string | null
          nb_divergences?: number | null
          patient_id?: string
          storage_path?: string
          triage_complexe?: boolean | null
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacist_gold_standards_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacist_gold_standards_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pharmacist_gold_standards_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_omissions: {
        Row: {
          commentaire: string | null
          created_at: string
          created_by: string | null
          episode_id: string
          id: string
          justifiee: boolean
          traitement_id: string
          updated_at: string
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          episode_id: string
          id?: string
          justifiee?: boolean
          traitement_id: string
          updated_at?: string
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          episode_id?: string
          id?: string
          justifiee?: boolean
          traitement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescription_omissions_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_omissions_traitement_id_fkey"
            columns: ["traitement_id"]
            isOneToOne: false
            referencedRelation: "traitements_habituels"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions_hospitalieres: {
        Row: {
          actif: boolean
          cis: number | null
          code_atc: string | null
          created_at: string
          date_debut: string
          date_fin: string | null
          dosage: string | null
          dosage_unite: string | null
          episode_id: string
          id: string
          indication: string | null
          match_analyzed_at: string | null
          match_reason: string | null
          match_recommandation: string | null
          match_source: string | null
          match_status: string | null
          medicament: string
          nom_commercial: string | null
          patient_id: string
          posologie: string | null
          posologie_coucher: string | null
          posologie_matin: string | null
          posologie_midi: string | null
          posologie_soir: string | null
          prescripteur: string | null
          source: string | null
          source_document_id: string | null
          voie_administration: string | null
        }
        Insert: {
          actif?: boolean
          cis?: number | null
          code_atc?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          episode_id: string
          id?: string
          indication?: string | null
          match_analyzed_at?: string | null
          match_reason?: string | null
          match_recommandation?: string | null
          match_source?: string | null
          match_status?: string | null
          medicament: string
          nom_commercial?: string | null
          patient_id: string
          posologie?: string | null
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          prescripteur?: string | null
          source?: string | null
          source_document_id?: string | null
          voie_administration?: string | null
        }
        Update: {
          actif?: boolean
          cis?: number | null
          code_atc?: string | null
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          episode_id?: string
          id?: string
          indication?: string | null
          match_analyzed_at?: string | null
          match_reason?: string | null
          match_recommandation?: string | null
          match_source?: string | null
          match_status?: string | null
          medicament?: string
          nom_commercial?: string | null
          patient_id?: string
          posologie?: string | null
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          prescripteur?: string | null
          source?: string | null
          source_document_id?: string | null
          voie_administration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_hospitalieres_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_hospitalieres_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_hospitalieres_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
          metadata: Json
          ord: number
          tokens: number | null
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          metadata?: Json
          ord?: number
          tokens?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          metadata?: Json
          ord?: number
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rag_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documents: {
        Row: {
          id: string
          ingested_at: string
          licence: string | null
          source: string
          titre: string
          url: string | null
          version: string | null
        }
        Insert: {
          id?: string
          ingested_at?: string
          licence?: string | null
          source: string
          titre: string
          url?: string | null
          version?: string | null
        }
        Update: {
          id?: string
          ingested_at?: string
          licence?: string | null
          source?: string
          titre?: string
          url?: string | null
          version?: string | null
        }
        Relationships: []
      }
      rag_query_logs: {
        Row: {
          created_at: string
          episode_id: string | null
          hits: Json
          id: string
          query: string
          top_k: number
          used_in_analysis: boolean
        }
        Insert: {
          created_at?: string
          episode_id?: string | null
          hits?: Json
          id?: string
          query: string
          top_k: number
          used_in_analysis?: boolean
        }
        Update: {
          created_at?: string
          episode_id?: string | null
          hits?: Json
          id?: string
          query?: string
          top_k?: number
          used_in_analysis?: boolean
        }
        Relationships: []
      }
      risk_scores: {
        Row: {
          ai_adjustment: string | null
          computed_at: string
          created_by: string
          episode_id: string
          id: string
          niveau: string
          score: number
          source: string
          variables: Json
        }
        Insert: {
          ai_adjustment?: string | null
          computed_at?: string
          created_by?: string
          episode_id: string
          id?: string
          niveau: string
          score: number
          source?: string
          variables?: Json
        }
        Update: {
          ai_adjustment?: string | null
          computed_at?: string
          created_by?: string
          episode_id?: string
          id?: string
          niveau?: string
          score?: number
          source?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      traitement_sources: {
        Row: {
          created_at: string
          id: string
          source_document_id: string
          traitement_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_document_id: string
          traitement_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_document_id?: string
          traitement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traitement_sources_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traitement_sources_traitement_id_fkey"
            columns: ["traitement_id"]
            isOneToOne: false
            referencedRelation: "traitements_habituels"
            referencedColumns: ["id"]
          },
        ]
      }
      traitements_habituels: {
        Row: {
          actif: boolean
          cis: number | null
          code_atc: string | null
          created_at: string
          dci: string | null
          dosage: string | null
          dosage_unite: string | null
          duree: string | null
          id: string
          indication: string | null
          nom_commercial: string | null
          patient_id: string
          posologie_coucher: string | null
          posologie_matin: string | null
          posologie_midi: string | null
          posologie_soir: string | null
          posologie_texte: string | null
          source: string | null
          source_document_id: string | null
          updated_at: string
          voie_administration: string | null
        }
        Insert: {
          actif?: boolean
          cis?: number | null
          code_atc?: string | null
          created_at?: string
          dci?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          duree?: string | null
          id?: string
          indication?: string | null
          nom_commercial?: string | null
          patient_id: string
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          posologie_texte?: string | null
          source?: string | null
          source_document_id?: string | null
          updated_at?: string
          voie_administration?: string | null
        }
        Update: {
          actif?: boolean
          cis?: number | null
          code_atc?: string | null
          created_at?: string
          dci?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          duree?: string | null
          id?: string
          indication?: string | null
          nom_commercial?: string | null
          patient_id?: string
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          posologie_texte?: string | null
          source?: string | null
          source_document_id?: string | null
          updated_at?: string
          voie_administration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traitements_habituels_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traitements_habituels_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_provider_decrypt_key: {
        Args: { _master_key: string; _provider_id: string }
        Returns: string
      }
      ai_provider_set_key: {
        Args: { _master_key: string; _plain_key: string; _provider_id: string }
        Returns: undefined
      }
      append_audit_log: {
        Args: {
          _action: string
          _entity_id?: string
          _entity_type?: string
          _payload?: Json
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: { Args: { _org_id: string }; Returns: boolean }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      match_rag_chunks: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
          source_filter?: string[]
        }
        Returns: {
          content: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
          source: string
          titre: string
          version: string
        }[]
      }
      owns_episode: { Args: { _episode_id: string }; Returns: boolean }
      owns_patient: { Args: { _patient_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
