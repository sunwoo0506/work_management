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
      assistant_messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          reflected: boolean
          reflected_step_id: string | null
          role: string
          sources: Json
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          reflected?: boolean
          reflected_step_id?: string | null
          role: string
          sources?: Json
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          reflected?: boolean
          reflected_step_id?: string | null
          role?: string
          sources?: Json
          thread_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_messages_reflected_step_id_fkey"
            columns: ["reflected_step_id"]
            isOneToOne: false
            referencedRelation: "procedure_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_at: string
          procedure_id: string | null
          run_id: string | null
          started_at: string
          status: string
          task_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_at?: string
          procedure_id?: string | null
          run_id?: string | null
          started_at?: string
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_at?: string
          procedure_id?: string | null
          run_id?: string | null
          started_at?: string
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_threads_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_threads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_threads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          company_id: string
          created_at: string
          extract_note: string | null
          extract_status: string
          extracted_text: string | null
          id: string
          mime: string | null
          name: string
          size_bytes: number | null
          storage_path: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          extract_note?: string | null
          extract_status?: string
          extracted_text?: string | null
          id?: string
          mime?: string | null
          name: string
          size_bytes?: number | null
          storage_path: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          extract_note?: string | null
          extract_status?: string
          extracted_text?: string | null
          id?: string
          mime?: string | null
          name?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          action: string | null
          called_at: string
          company_id: string
          content: string
          counterpart: string | null
          created_at: string
          direction: string
          handled: boolean
          id: string
          org: string | null
          phone: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string | null
          called_at?: string
          company_id: string
          content: string
          counterpart?: string | null
          created_at?: string
          direction?: string
          handled?: boolean
          id?: string
          org?: string | null
          phone?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string | null
          called_at?: string
          company_id?: string
          content?: string
          counterpart?: string | null
          created_at?: string
          direction?: string
          handled?: boolean
          id?: string
          org?: string | null
          phone?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist: {
        Row: {
          company_id: string
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          label: string
          note: string | null
          promoted_task_id: string | null
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
          due_date?: string | null
          id?: string
          label: string
          note?: string | null
          promoted_task_id?: string | null
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
          due_date?: string | null
          id?: string
          label?: string
          note?: string | null
          promoted_task_id?: string | null
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
            foreignKeyName: "checklist_promoted_task_id_fkey"
            columns: ["promoted_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      contacts: {
        Row: {
          company_id: string
          created_at: string
          dept: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          to_ask: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dept?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          to_ask?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dept?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          to_ask?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          milestone_id: string | null
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
          milestone_id?: string | null
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
          milestone_id?: string | null
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
          {
            foreignKeyName: "directives_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
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
      document_templates: {
        Row: {
          active: boolean
          body: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          needed_input: Json
          procedure_id: string | null
          title: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active?: boolean
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          needed_input?: Json
          procedure_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active?: boolean
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          needed_input?: Json
          procedure_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          company_id: string
          created_at: string
          draft_body: string | null
          final_body: string | null
          finalized_at: string | null
          id: string
          referenced: Json
          run_id: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          draft_body?: string | null
          final_body?: string | null
          finalized_at?: string | null
          id?: string
          referenced?: Json
          run_id?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          draft_body?: string | null
          final_body?: string | null
          finalized_at?: string | null
          id?: string
          referenced?: Json
          run_id?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          at: string
          company_id: string
          created_at: string
          id: string
          kind: string
          repeat_rule: string | null
          title: string
          until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          at: string
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          repeat_rule?: string | null
          title: string
          until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          at?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          repeat_rule?: string | null
          title?: string
          until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      handover: {
        Row: {
          category: string | null
          company_id: string
          counterpart: string | null
          created_at: string
          due_date: string | null
          id: string
          item: string
          memo: string | null
          status: string
          to_ask: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          company_id: string
          counterpart?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          item: string
          memo?: string | null
          status?: string
          to_ask?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          company_id?: string
          counterpart?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          item?: string
          memo?: string | null
          status?: string
          to_ask?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      meetings: {
        Row: {
          agenda: string | null
          ai_draft: Json | null
          attendees: string | null
          company_id: string
          created_at: string
          decisions: string | null
          duration_sec: number | null
          follow_ups: Json
          id: string
          met_on: string
          my_notes: string | null
          place: string | null
          sensitive: boolean
          title: string
          transcript: string | null
          transcript_source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agenda?: string | null
          ai_draft?: Json | null
          attendees?: string | null
          company_id: string
          created_at?: string
          decisions?: string | null
          duration_sec?: number | null
          follow_ups?: Json
          id?: string
          met_on: string
          my_notes?: string | null
          place?: string | null
          sensitive?: boolean
          title: string
          transcript?: string | null
          transcript_source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agenda?: string | null
          ai_draft?: Json | null
          attendees?: string | null
          company_id?: string
          created_at?: string
          decisions?: string | null
          duration_sec?: number | null
          follow_ups?: Json
          id?: string
          met_on?: string
          my_notes?: string | null
          place?: string | null
          sensitive?: boolean
          title?: string
          transcript?: string | null
          transcript_source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          done_criteria: string | null
          id: string
          name: string
          start_date: string | null
          status: string
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          done_criteria?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          done_criteria?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      plans: {
        Row: {
          company_id: string
          created_at: string
          goals: Json
          id: string
          kind: string
          memo: string | null
          period_from: string
          period_to: string
          retro: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          goals?: Json
          id?: string
          kind: string
          memo?: string | null
          period_from: string
          period_to: string
          retro?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          goals?: Json
          id?: string
          kind?: string
          memo?: string | null
          period_from?: string
          period_to?: string
          retro?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_company_id_fkey"
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
      settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          detail: string | null
          directive_id: string | null
          due_date: string | null
          focus_date: string | null
          id: string
          intake_channel: string | null
          notes: string | null
          parent_task_id: string | null
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
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          directive_id?: string | null
          due_date?: string | null
          focus_date?: string | null
          id?: string
          intake_channel?: string | null
          notes?: string | null
          parent_task_id?: string | null
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
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          directive_id?: string | null
          due_date?: string | null
          focus_date?: string | null
          id?: string
          intake_channel?: string | null
          notes?: string | null
          parent_task_id?: string | null
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
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
