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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          action: string
          company_id: string
          detail: Json | null
          id: string
          occurred_at: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          detail?: Json | null
          id?: string
          occurred_at?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          detail?: Json | null
          id?: string
          occurred_at?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist: {
        Row: {
          company_id: string
          created_at: string
          done: boolean
          id: string
          label: string
          required: boolean
          sort_order: number
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          done?: boolean
          id?: string
          label: string
          required?: boolean
          sort_order?: number
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          required?: boolean
          sort_order?: number
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          id: string
          issues: string | null
          log_date: string
          memo: string | null
          snapshot: Json
          spent_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          issues?: string | null
          log_date: string
          memo?: string | null
          snapshot?: Json
          spent_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          issues?: string | null
          log_date?: string
          memo?: string | null
          snapshot?: Json
          spent_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      directives: {
        Row: {
          area: string | null
          axis: string | null
          code: string
          company_id: string
          created_at: string
          due_date: string | null
          id: string
          priority: string
          rationale: string | null
          sort_order: number
          source_ref: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          axis?: string | null
          code: string
          company_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          priority?: string
          rationale?: string | null
          sort_order?: number
          source_ref?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          axis?: string | null
          code?: string
          company_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          priority?: string
          rationale?: string | null
          sort_order?: number
          source_ref?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "directives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_policy: {
        Row: {
          condition: string | null
          learn_allowed: boolean
          quote_allowed: string
          reason: string
          table_name: string
          updated_at: string
        }
        Insert: {
          condition?: string | null
          learn_allowed?: boolean
          quote_allowed: string
          reason: string
          table_name: string
          updated_at?: string
        }
        Update: {
          condition?: string | null
          learn_allowed?: boolean
          quote_allowed?: string
          reason?: string
          table_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      exceptions: {
        Row: {
          company_id: string
          confirm: string
          created_at: string
          detected: string
          explanation: string | null
          id: string
          reflected: boolean
          rule: string
          run_id: string
          run_step_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          confirm?: string
          created_at?: string
          detected: string
          explanation?: string | null
          id?: string
          reflected?: boolean
          rule: string
          run_id: string
          run_step_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          confirm?: string
          created_at?: string
          detected?: string
          explanation?: string | null
          id?: string
          reflected?: boolean
          rule?: string
          run_id?: string
          run_step_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exceptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exceptions_run_step_id_fkey"
            columns: ["run_step_id"]
            isOneToOne: false
            referencedRelation: "run_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          origin: string
          origin_ref: string | null
          promoted_task_id: string | null
          tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          origin?: string
          origin_ref?: string | null
          promoted_task_id?: string | null
          tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          origin?: string
          origin_ref?: string | null
          promoted_task_id?: string | null
          tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_promoted_task_id_fkey"
            columns: ["promoted_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      log_todos: {
        Row: {
          company_id: string
          created_at: string
          daily_log_id: string
          id: string
          priority: string
          promote: boolean
          promoted_task_id: string | null
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_log_id: string
          id?: string
          priority?: string
          promote?: boolean
          promoted_task_id?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_log_id?: string
          id?: string
          priority?: string
          promote?: boolean
          promoted_task_id?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_todos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_todos_daily_log_id_fkey"
            columns: ["daily_log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_todos_promoted_task_id_fkey"
            columns: ["promoted_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      periodic_reports: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          narrative: string | null
          period_from: string
          period_to: string
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind: string
          narrative?: string | null
          period_from: string
          period_to: string
          snapshot?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          narrative?: string | null
          period_from?: string
          period_to?: string
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periodic_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      procedure_steps: {
        Row: {
          automatable: boolean
          company_id: string
          created_at: string
          decision_rule: string | null
          expected_min: number | null
          id: string
          needed_input: string | null
          procedure_id: string
          required: boolean
          seq: number
          title: string
          updated_at: string
          user_id: string
          what_to_do: string | null
        }
        Insert: {
          automatable?: boolean
          company_id: string
          created_at?: string
          decision_rule?: string | null
          expected_min?: number | null
          id?: string
          needed_input?: string | null
          procedure_id: string
          required?: boolean
          seq: number
          title: string
          updated_at?: string
          user_id: string
          what_to_do?: string | null
        }
        Update: {
          automatable?: boolean
          company_id?: string
          created_at?: string
          decision_rule?: string | null
          expected_min?: number | null
          id?: string
          needed_input?: string | null
          procedure_id?: string
          required?: boolean
          seq?: number
          title?: string
          updated_at?: string
          user_id?: string
          what_to_do?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_steps_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          ai_delegation: string
          area: string | null
          code: string | null
          company_id: string
          created_at: string
          id: string
          inputs: Json
          origin: string
          outputs: Json
          purpose: string | null
          sort_order: number
          status: string
          title: string
          trigger_rule: Json
          trigger_type: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          ai_delegation?: string
          area?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          inputs?: Json
          origin?: string
          outputs?: Json
          purpose?: string | null
          sort_order?: number
          status?: string
          title: string
          trigger_rule?: Json
          trigger_type?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          ai_delegation?: string
          area?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          inputs?: Json
          origin?: string
          outputs?: Json
          purpose?: string | null
          sort_order?: number
          status?: string
          title?: string
          trigger_rule?: Json
          trigger_type?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      run_steps: {
        Row: {
          actual_min: number | null
          company_id: string
          created_at: string
          done: boolean
          done_at: string | null
          human_intervened: boolean
          id: string
          note: string | null
          output: string | null
          procedure_step_id: string | null
          run_id: string
          seq: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_min?: number | null
          company_id: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          human_intervened?: boolean
          id?: string
          note?: string | null
          output?: string | null
          procedure_step_id?: string | null
          run_id: string
          seq: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_min?: number | null
          company_id?: string
          created_at?: string
          done?: boolean
          done_at?: string | null
          human_intervened?: boolean
          id?: string
          note?: string | null
          output?: string | null
          procedure_step_id?: string | null
          run_id?: string
          seq?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_steps_procedure_step_id_fkey"
            columns: ["procedure_step_id"]
            isOneToOne: false
            referencedRelation: "procedure_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          company_id: string
          created_at: string
          finished_at: string | null
          id: string
          note: string | null
          performer: string
          period_label: string | null
          procedure_id: string
          result: string
          seq: number
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          note?: string | null
          performer?: string
          period_label?: string | null
          procedure_id: string
          result?: string
          seq: number
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          note?: string | null
          performer?: string
          period_label?: string | null
          procedure_id?: string
          result?: string
          seq?: number
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: string | null
          company_id: string
          created_at: string
          detail: string | null
          directive_id: string | null
          due_date: string | null
          focus_date: string | null
          id: string
          intake_channel: string | null
          priority: string
          procedure_id: string | null
          progress: number
          reply_body: string | null
          reply_due: string | null
          requester: string | null
          requester_dept: string | null
          run_id: string | null
          sort_order: number
          source: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area?: string | null
          company_id: string
          created_at?: string
          detail?: string | null
          directive_id?: string | null
          due_date?: string | null
          focus_date?: string | null
          id?: string
          intake_channel?: string | null
          priority?: string
          procedure_id?: string | null
          progress?: number
          reply_body?: string | null
          reply_due?: string | null
          requester?: string | null
          requester_dept?: string | null
          run_id?: string | null
          sort_order?: number
          source?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area?: string | null
          company_id?: string
          created_at?: string
          detail?: string | null
          directive_id?: string | null
          due_date?: string | null
          focus_date?: string | null
          id?: string
          intake_channel?: string | null
          priority?: string
          procedure_id?: string | null
          progress?: number
          reply_body?: string | null
          reply_due?: string | null
          requester?: string | null
          requester_dept?: string | null
          run_id?: string | null
          sort_order?: number
          source?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_directive_id_fkey"
            columns: ["directive_id"]
            isOneToOne: false
            referencedRelation: "directives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
