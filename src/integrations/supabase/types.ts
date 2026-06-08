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
      allergies: {
        Row: {
          created_at: string
          date_apparition: string | null
          id: string
          notes: string | null
          patient_id: string
          reaction: string | null
          severite: string | null
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
          type: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          date_evenement?: string | null
          description: string
          id?: string
          patient_id: string
          type: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          date_evenement?: string | null
          description?: string
          id?: string
          patient_id?: string
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
        ]
      }
      comorbidites: {
        Row: {
          code_cim10: string | null
          created_at: string
          id: string
          libelle: string
          patient_id: string
          statut: string
        }
        Insert: {
          code_cim10?: string | null
          created_at?: string
          id?: string
          libelle: string
          patient_id: string
          statut?: string
        }
        Update: {
          code_cim10?: string | null
          created_at?: string
          id?: string
          libelle?: string
          patient_id?: string
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
        ]
      }
      conciliation_ai_analyses: {
        Row: {
          created_at: string
          episode_id: string | null
          id: string
          model: string
          patient_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          episode_id?: string | null
          id?: string
          model: string
          patient_id: string
          payload: Json
        }
        Update: {
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
      episodes: {
        Row: {
          created_at: string
          date_entree: string
          date_sortie: string | null
          id: string
          motif: string | null
          patient_id: string
          service: string | null
          statut: string
          updated_at: string
          via_urgences: boolean
        }
        Insert: {
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          id?: string
          motif?: string | null
          patient_id: string
          service?: string | null
          statut?: string
          updated_at?: string
          via_urgences?: boolean
        }
        Update: {
          created_at?: string
          date_entree?: string
          date_sortie?: string | null
          id?: string
          motif?: string | null
          patient_id?: string
          service?: string | null
          statut?: string
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
      prescriptions_hospitalieres: {
        Row: {
          actif: boolean
          created_at: string
          date_debut: string
          date_fin: string | null
          dosage: string | null
          episode_id: string
          id: string
          indication: string | null
          medicament: string
          patient_id: string
          posologie: string | null
          prescripteur: string | null
          voie_administration: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dosage?: string | null
          episode_id: string
          id?: string
          indication?: string | null
          medicament: string
          patient_id: string
          posologie?: string | null
          prescripteur?: string | null
          voie_administration?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          date_debut?: string
          date_fin?: string | null
          dosage?: string | null
          episode_id?: string
          id?: string
          indication?: string | null
          medicament?: string
          patient_id?: string
          posologie?: string | null
          prescripteur?: string | null
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
      traitements_habituels: {
        Row: {
          actif: boolean
          created_at: string
          dci: string | null
          dosage: string | null
          dosage_unite: string | null
          id: string
          indication: string | null
          nom_commercial: string | null
          patient_id: string
          posologie_coucher: string | null
          posologie_matin: string | null
          posologie_midi: string | null
          posologie_soir: string | null
          source: string | null
          updated_at: string
          voie_administration: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          dci?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          id?: string
          indication?: string | null
          nom_commercial?: string | null
          patient_id: string
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          source?: string | null
          updated_at?: string
          voie_administration?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          dci?: string | null
          dosage?: string | null
          dosage_unite?: string | null
          id?: string
          indication?: string | null
          nom_commercial?: string | null
          patient_id?: string
          posologie_coucher?: string | null
          posologie_matin?: string | null
          posologie_midi?: string | null
          posologie_soir?: string | null
          source?: string | null
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_episode: { Args: { _episode_id: string }; Returns: boolean }
      owns_patient: { Args: { _patient_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
