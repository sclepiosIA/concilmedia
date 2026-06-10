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
          patient_id: string
          payload: Json
        }
        Insert: {
          analysis_type?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          model: string
          patient_id: string
          payload: Json
        }
        Update: {
          analysis_type?: string
          created_at?: string
          episode_id?: string | null
          id?: string
          model?: string
          patient_id?: string
          payload?: Json
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
          contexte_social: string | null
          created_at: string
          date_entree: string
          date_sortie: string | null
          etat_general: string | null
          eva_douleur: number | null
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
          contexte_social?: string | null
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          etat_general?: string | null
          eva_douleur?: number | null
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
          contexte_social?: string | null
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          etat_general?: string | null
          eva_douleur?: number | null
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
            foreignKeyName: "episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
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
      patients: {
        Row: {
          cohort_tag: string | null
          created_at: string
          created_by: string
          date_naissance: string | null
          id: string
          is_synthetic: boolean
          nir: string | null
          nom: string
          notes: string | null
          poids_kg: number | null
          prenom: string
          sexe: string | null
          taille_cm: number | null
          updated_at: string
        }
        Insert: {
          cohort_tag?: string | null
          created_at?: string
          created_by: string
          date_naissance?: string | null
          id?: string
          is_synthetic?: boolean
          nir?: string | null
          nom: string
          notes?: string | null
          poids_kg?: number | null
          prenom: string
          sexe?: string | null
          taille_cm?: number | null
          updated_at?: string
        }
        Update: {
          cohort_tag?: string | null
          created_at?: string
          created_by?: string
          date_naissance?: string | null
          id?: string
          is_synthetic?: boolean
          nir?: string | null
          nom?: string
          notes?: string | null
          poids_kg?: number | null
          prenom?: string
          sexe?: string | null
          taille_cm?: number | null
          updated_at?: string
        }
        Relationships: []
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
      risk_scores: {
        Row: {
          ai_adjustment: string | null
          computed_at: string
          created_by: string
          episode_id: string
          id: string
          niveau: string
          score: number
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_episode: { Args: { _episode_id: string }; Returns: boolean }
      owns_patient: { Args: { _patient_id: string }; Returns: boolean }
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
