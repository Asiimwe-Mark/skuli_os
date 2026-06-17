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
      academic_years: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          is_deleted: boolean
          level: string | null
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          level?: string | null
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          level?: string | null
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni: {
        Row: {
          admission_number: string | null
          created_at: string
          current_school: string | null
          email: string | null
          first_name: string
          graduation_year: number
          id: string
          is_deleted: boolean
          last_class: string | null
          last_name: string
          notes: string | null
          phone: string | null
          profession: string | null
          school_id: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          admission_number?: string | null
          created_at?: string
          current_school?: string | null
          email?: string | null
          first_name: string
          graduation_year: number
          id?: string
          is_deleted?: boolean
          last_class?: string | null
          last_name: string
          notes?: string | null
          phone?: string | null
          profession?: string | null
          school_id: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          admission_number?: string | null
          created_at?: string
          current_school?: string | null
          email?: string | null
          first_name?: string
          graduation_year?: number
          id?: string
          is_deleted?: boolean
          last_class?: string | null
          last_name?: string
          notes?: string | null
          phone?: string | null
          profession?: string | null
          school_id?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_deleted: boolean
          scheduled_at: string | null
          scheduled_status: string
          school_id: string
          sent_at: string | null
          sent_by: string | null
          sent_via: string
          sms_cost: number | null
          target_audience: Database["public"]["Enums"]["announcement_target"]
          target_class_ids: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          scheduled_at?: string | null
          scheduled_status?: string
          school_id: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string
          sms_cost?: number | null
          target_audience: Database["public"]["Enums"]["announcement_target"]
          target_class_ids?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          scheduled_at?: string | null
          scheduled_status?: string
          school_id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string
          sms_cost?: number | null
          target_audience?: Database["public"]["Enums"]["announcement_target"]
          target_class_ids?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance: {
        Row: {
          asset_id: string
          cost: number | null
          created_at: string
          description: string
          id: string
          maintenance_date: string
          next_service_date: string | null
          performed_by: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          cost?: number | null
          created_at?: string
          description: string
          id?: string
          maintenance_date: string
          next_service_date?: string | null
          performed_by?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          cost?: number | null
          created_at?: string
          description?: string
          id?: string
          maintenance_date?: string
          next_service_date?: string | null
          performed_by?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_code: string | null
          assigned_to: string | null
          category: string | null
          condition: Database["public"]["Enums"]["asset_condition"]
          created_at: string
          current_value: number | null
          id: string
          is_deleted: boolean
          location: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          school_id: string
          updated_at: string
        }
        Insert: {
          asset_code?: string | null
          assigned_to?: string | null
          category?: string | null
          condition?: Database["public"]["Enums"]["asset_condition"]
          created_at?: string
          current_value?: number | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          school_id: string
          updated_at?: string
        }
        Update: {
          asset_code?: string | null
          assigned_to?: string | null
          category?: string | null
          condition?: Database["public"]["Enums"]["asset_condition"]
          created_at?: string
          current_value?: number | null
          id?: string
          is_deleted?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          is_deleted: boolean
          marked_by: string | null
          notes: string | null
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          is_deleted?: boolean
          marked_by?: string | null
          notes?: string | null
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          is_deleted?: boolean
          marked_by?: string | null
          notes?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          is_deleted: boolean
          new_value: Json | null
          old_value: Json | null
          school_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          is_deleted?: boolean
          new_value?: Json | null
          old_value?: Json | null
          school_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          is_deleted?: boolean
          new_value?: Json | null
          old_value?: Json | null
          school_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_line_items: {
        Row: {
          batch_id: string
          created_at: string
          disbursal_attempts: number
          disbursal_status: Database["public"]["Enums"]["disbursal_status"]
          disbursed_at: string | null
          id: number
          idempotency_key: string
          last_error: string | null
          payout_amount: number
          payroll_record_id: string | null
          processing_fee: number
          provider_receipt_id: string | null
          snapshot_account_number: string | null
          snapshot_bank_code: string | null
          snapshot_mobile_number: string | null
          snapshot_payout_method: Database["public"]["Enums"]["staff_payout_method"]
          staff_id: string
          updated_at: string
          worker_name: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          disbursal_attempts?: number
          disbursal_status?: Database["public"]["Enums"]["disbursal_status"]
          disbursed_at?: string | null
          id?: never
          idempotency_key: string
          last_error?: string | null
          payout_amount?: number
          payroll_record_id?: string | null
          processing_fee?: number
          provider_receipt_id?: string | null
          snapshot_account_number?: string | null
          snapshot_bank_code?: string | null
          snapshot_mobile_number?: string | null
          snapshot_payout_method: Database["public"]["Enums"]["staff_payout_method"]
          staff_id: string
          updated_at?: string
          worker_name: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          disbursal_attempts?: number
          disbursal_status?: Database["public"]["Enums"]["disbursal_status"]
          disbursed_at?: string | null
          id?: never
          idempotency_key?: string
          last_error?: string | null
          payout_amount?: number
          payroll_record_id?: string | null
          processing_fee?: number
          provider_receipt_id?: string | null
          snapshot_account_number?: string | null
          snapshot_bank_code?: string | null
          snapshot_mobile_number?: string | null
          snapshot_payout_method?: Database["public"]["Enums"]["staff_payout_method"]
          staff_id?: string
          updated_at?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_line_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payroll_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_line_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_credits: {
        Row: {
          id: string
          months: number
          school_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          months?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          months?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_credits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          affects_attendance: boolean
          class_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_date: string
          event_type: string
          id: string
          is_deleted: boolean
          is_public: boolean
          school_id: string
          title: string
        }
        Insert: {
          affects_attendance?: boolean
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_date: string
          event_type?: string
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          school_id: string
          title: string
        }
        Update: {
          affects_attendance?: boolean
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_date?: string
          event_type?: string
          id?: string
          is_deleted?: boolean
          is_public?: boolean
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "calendar_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          id: string
          is_deleted: boolean
          student_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          student_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          student_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_deleted: boolean
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number | null
          class_teacher_id: string | null
          created_at: string
          id: string
          is_deleted: boolean
          level: string | null
          name: string
          school_id: string
          stream: string | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          level?: string | null
          name: string
          school_id: string
          stream?: string | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          level?: string | null
          name?: string
          school_id?: string
          stream?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_leads: {
        Row: {
          assigned_to: string | null
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          current_system: string | null
          district: string | null
          followed_up_at: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          preferred_date: string | null
          school_name: string
          status: Database["public"]["Enums"]["concierge_status"]
          student_count: number | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at?: string
          current_system?: string | null
          district?: string | null
          followed_up_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          preferred_date?: string | null
          school_name: string
          status?: Database["public"]["Enums"]["concierge_status"]
          student_count?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          current_system?: string | null
          district?: string | null
          followed_up_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          preferred_date?: string | null
          school_name?: string
          status?: Database["public"]["Enums"]["concierge_status"]
          student_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "concierge_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      country_configs: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          currency_symbol: string
          is_active: boolean
          mobile_money_providers: Json
          name: string
          phone_prefix: string
          term_structure: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code: string
          currency_symbol: string
          is_active?: boolean
          mobile_money_providers?: Json
          name: string
          phone_prefix: string
          term_structure?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          is_active?: boolean
          mobile_money_providers?: Json
          name?: string
          phone_prefix?: string
          term_structure?: string
        }
        Relationships: []
      }
      discipline_records: {
        Row: {
          action_taken: string | null
          created_at: string
          description: string
          id: string
          incident_date: string
          incident_type: Database["public"]["Enums"]["discipline_incident_type"]
          is_deleted: boolean
          parent_notified: boolean
          parent_notified_at: string | null
          recorded_by: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          description: string
          id?: string
          incident_date: string
          incident_type: Database["public"]["Enums"]["discipline_incident_type"]
          is_deleted?: boolean
          parent_notified?: boolean
          parent_notified_at?: string | null
          recorded_by?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          description?: string
          id?: string
          incident_date?: string
          incident_type?: Database["public"]["Enums"]["discipline_incident_type"]
          is_deleted?: boolean
          parent_notified?: boolean
          parent_notified_at?: string | null
          recorded_by?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      emis_report_logs: {
        Row: {
          academic_year_id: string | null
          created_at: string
          generated_by: string
          id: string
          pdf_url: string | null
          record_count: number | null
          report_type: string
          school_id: string
          term_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          created_at?: string
          generated_by: string
          id?: string
          pdf_url?: string | null
          record_count?: number | null
          report_type?: string
          school_id: string
          term_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          created_at?: string
          generated_by?: string
          id?: string
          pdf_url?: string | null
          record_count?: number | null
          report_type?: string
          school_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emis_report_logs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emis_report_logs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emis_report_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emis_report_logs_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_deleted: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string
          expense_date: string
          id: string
          is_deleted: boolean
          notes: string | null
          payment_method:
            | Database["public"]["Enums"]["expense_payment_method"]
            | null
          receipt_number: string | null
          recorded_by: string | null
          school_id: string
          term_id: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          description: string
          expense_date: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          payment_method?:
            | Database["public"]["Enums"]["expense_payment_method"]
            | null
          receipt_number?: string | null
          recorded_by?: string | null
          school_id: string
          term_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          payment_method?:
            | Database["public"]["Enums"]["expense_payment_method"]
            | null
          receipt_number?: string | null
          recorded_by?: string | null
          school_id?: string
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_accounts: {
        Row: {
          academic_year_id: string
          balance: number
          created_at: string
          id: string
          is_deleted: boolean
          school_id: string
          status: Database["public"]["Enums"]["fee_account_status"]
          student_id: string
          term_id: string
          total_discount: number
          total_expected: number
          total_fees: number
          total_paid: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          balance?: number
          created_at?: string
          id?: string
          is_deleted?: boolean
          school_id: string
          status?: Database["public"]["Enums"]["fee_account_status"]
          student_id: string
          term_id: string
          total_discount?: number
          total_expected?: number
          total_fees?: number
          total_paid?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          balance?: number
          created_at?: string
          id?: string
          is_deleted?: boolean
          school_id?: string
          status?: Database["public"]["Enums"]["fee_account_status"]
          student_id?: string
          term_id?: string
          total_discount?: number
          total_expected?: number
          total_fees?: number
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_accounts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_accounts_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_discounts: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          id: string
          is_active: boolean
          is_deleted: boolean
          is_recurring: boolean
          max_amount: number | null
          name: string
          school_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type?: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_recurring?: boolean
          max_amount?: number | null
          name: string
          school_id: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_recurring?: boolean
          max_amount?: number | null
          name?: string
          school_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_discounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount: number
          created_at: string
          fee_account_id: string
          id: string
          is_deleted: boolean
          mobile_money_provider:
            | Database["public"]["Enums"]["mm_provider"]
            | null
          mobile_money_transaction_id: string | null
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          pesapal_order_tracking_id: string | null
          pesapal_tx_id: string | null
          phone_used: string | null
          receipt_number: string | null
          received_by_user_id: string | null
          school_id: string
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_account_id: string
          id?: string
          is_deleted?: boolean
          mobile_money_provider?:
            | Database["public"]["Enums"]["mm_provider"]
            | null
          mobile_money_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          pesapal_order_tracking_id?: string | null
          pesapal_tx_id?: string | null
          phone_used?: string | null
          receipt_number?: string | null
          received_by_user_id?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_account_id?: string
          id?: string
          is_deleted?: boolean
          mobile_money_provider?:
            | Database["public"]["Enums"]["mm_provider"]
            | null
          mobile_money_transaction_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          pesapal_order_tracking_id?: string | null
          pesapal_tx_id?: string | null
          phone_used?: string | null
          receipt_number?: string | null
          received_by_user_id?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_account_id_fkey"
            columns: ["fee_account_id"]
            isOneToOne: false
            referencedRelation: "fee_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_received_by_user_id_fkey"
            columns: ["received_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structure_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          fee_structure_id: string
          id: string
          new_value: Json | null
          old_value: Json | null
          school_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          fee_structure_id: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          school_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          fee_structure_id?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structure_audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_audit_log_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_audit_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          class_id: string | null
          created_at: string
          frequency: string | null
          id: string
          is_deleted: boolean
          is_mandatory: boolean
          name: string
          school_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          class_id?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          is_deleted?: boolean
          is_mandatory?: boolean
          name: string
          school_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          class_id?: string | null
          created_at?: string
          frequency?: string | null
          id?: string
          is_deleted?: boolean
          is_mandatory?: boolean
          name?: string
          school_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_scales: {
        Row: {
          created_at: string
          grade: string
          id: string
          is_deleted: boolean
          label: string | null
          max_score: number
          min_score: number
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade: string
          id?: string
          is_deleted?: boolean
          label?: string | null
          max_score: number
          min_score: number
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade?: string
          id?: string
          is_deleted?: boolean
          label?: string | null
          max_score?: number
          min_score?: number
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_scales_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      group_admins: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_admins_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "school_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_deleted: boolean
          is_read: boolean
          recipient_user_id: string
          related_entity_id: string | null
          related_entity_type: string | null
          school_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          recipient_user_id: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id: string
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          recipient_user_id?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_books: {
        Row: {
          author: string | null
          available_copies: number
          category: string | null
          created_at: string
          id: string
          is_deleted: boolean
          isbn: string | null
          school_id: string
          shelf_location: string | null
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          isbn?: string | null
          school_id: string
          shelf_location?: string | null
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string | null
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          isbn?: string | null
          school_id?: string
          shelf_location?: string | null
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_books_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      library_issues: {
        Row: {
          book_id: string
          due_date: string
          fine_amount: number | null
          fine_paid: boolean
          id: string
          is_deleted: boolean
          issued_at: string
          issued_by: string | null
          returned_at: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          due_date: string
          fine_amount?: number | null
          fine_paid?: boolean
          id?: string
          is_deleted?: boolean
          issued_at?: string
          issued_by?: string | null
          returned_at?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          due_date?: string
          fine_amount?: number | null
          fine_paid?: boolean
          id?: string
          is_deleted?: boolean
          issued_at?: string
          issued_by?: string | null
          returned_at?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_issues_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_templates: {
        Row: {
          body: Json
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_deleted: boolean
          is_featured: boolean
          name: string
          tags: string[] | null
          updated_at: string
          use_count: number
          variables: string[] | null
        }
        Insert: {
          body: Json
          category: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          is_featured?: boolean
          name: string
          tags?: string[] | null
          updated_at?: string
          use_count?: number
          variables?: string[] | null
        }
        Update: {
          body?: Json
          category?: Database["public"]["Enums"]["marketplace_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          is_featured?: boolean
          name?: string
          tags?: string[] | null
          updated_at?: string
          use_count?: number
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      marks: {
        Row: {
          academic_year_id: string
          class_id: string
          created_at: string
          entered_by: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id: string
          is_deleted: boolean
          max_score: number
          remarks: string | null
          review_comment: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string
          score: number | null
          student_id: string
          subject_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          class_id: string
          created_at?: string
          entered_by?: string | null
          exam_type: Database["public"]["Enums"]["exam_type"]
          id?: string
          is_deleted?: boolean
          max_score?: number
          remarks?: string | null
          review_comment?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id: string
          score?: number | null
          student_id: string
          subject_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          class_id?: string
          created_at?: string
          entered_by?: string | null
          exam_type?: Database["public"]["Enums"]["exam_type"]
          id?: string
          is_deleted?: boolean
          max_score?: number
          remarks?: string | null
          review_comment?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string
          score?: number | null
          student_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "marks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_bookings: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          parent_name: string
          parent_phone: string
          reminder_sent: boolean
          school_id: string
          slot_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          parent_name: string
          parent_phone: string
          reminder_sent?: boolean
          school_id: string
          slot_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          parent_name?: string
          parent_phone?: string
          reminder_sent?: boolean
          school_id?: string
          slot_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_bookings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "meeting_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_slots: {
        Row: {
          day_of_week: number | null
          duration_minutes: number
          end_time: string
          id: string
          is_booked: boolean
          is_deleted: boolean
          school_id: string
          slot_date: string
          start_time: string
          teacher_id: string
        }
        Insert: {
          duration_minutes?: number
          end_time: string
          id?: string
          is_booked?: boolean
          is_deleted?: boolean
          school_id: string
          slot_date: string
          start_time: string
          teacher_id: string
        }
        Update: {
          duration_minutes?: number
          end_time?: string
          id?: string
          is_booked?: boolean
          is_deleted?: boolean
          school_id?: string
          slot_date?: string
          start_time?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          id: string
          is_deleted: boolean
          is_read: boolean
          last_message_at: string
          parent_phone: string
          school_id: string
          student_id: string | null
        }
        Insert: {
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          last_message_at?: string
          parent_phone: string
          school_id: string
          student_id?: string | null
        }
        Update: {
          id?: string
          is_deleted?: boolean
          is_read?: boolean
          last_message_at?: string
          parent_phone?: string
          school_id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel_type: Database["public"]["Enums"]["notification_channel"]
          cost: number | null
          created_at: string
          delivery_status: string
          id: string
          last_error: string | null
          message_body: string
          multi_sms_flag: boolean
          provider_message_id: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          school_id: string
          sent_at: string | null
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["notification_channel"]
          cost?: number | null
          created_at?: string
          delivery_status?: string
          id?: string
          last_error?: string | null
          message_body: string
          multi_sms_flag?: boolean
          provider_message_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id: string
          sent_at?: string | null
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["notification_channel"]
          cost?: number | null
          created_at?: string
          delivery_status?: string
          id?: string
          last_error?: string | null
          message_body?: string
          multi_sms_flag?: boolean
          provider_message_id?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          defaulter_reminder_day: number
          defaulter_reminder_hour: number
          id: string
          is_deleted: boolean
          school_id: string
          send_absence_sms: boolean
          send_receipt_sms: boolean
          send_report_card_sms: boolean
          send_term_start_sms: boolean
          send_weekly_defaulter: boolean
          sms_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          defaulter_reminder_day?: number
          defaulter_reminder_hour?: number
          id?: string
          is_deleted?: boolean
          school_id: string
          send_absence_sms?: boolean
          send_receipt_sms?: boolean
          send_report_card_sms?: boolean
          send_term_start_sms?: boolean
          send_weekly_defaulter?: boolean
          sms_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          defaulter_reminder_day?: number
          defaulter_reminder_hour?: number
          id?: string
          is_deleted?: boolean
          school_id?: string
          send_absence_sms?: boolean
          send_receipt_sms?: boolean
          send_report_card_sms?: boolean
          send_term_start_sms?: boolean
          send_weekly_defaulter?: boolean
          sms_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          is_primary: boolean
          parent_id: string
          relationship: string | null
          school_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_primary?: boolean
          parent_id: string
          relationship?: string | null
          school_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          is_primary?: boolean
          parent_id?: string
          relationship?: string | null
          school_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_batches: {
        Row: {
          approved_by_user_id: string | null
          created_at: string
          funded_at: string | null
          funding_mechanism: Database["public"]["Enums"]["payroll_funding_mechanism"]
          funding_payment_status: Database["public"]["Enums"]["payroll_funding_status"]
          id: string
          label: string | null
          pesapal_funding_ref: string | null
          pesapal_funding_url: string | null
          pesapal_order_tracking_id: string | null
          school_id: string
          total_net_salaries: number
          total_overhead_fees: number
          total_payout_sum: number
          updated_at: string
        }
        Insert: {
          approved_by_user_id?: string | null
          created_at?: string
          funded_at?: string | null
          funding_mechanism: Database["public"]["Enums"]["payroll_funding_mechanism"]
          funding_payment_status?: Database["public"]["Enums"]["payroll_funding_status"]
          id: string
          label?: string | null
          pesapal_funding_ref?: string | null
          pesapal_funding_url?: string | null
          pesapal_order_tracking_id?: string | null
          school_id: string
          total_net_salaries?: number
          total_overhead_fees?: number
          total_payout_sum?: number
          updated_at?: string
        }
        Update: {
          approved_by_user_id?: string | null
          created_at?: string
          funded_at?: string | null
          funding_mechanism?: Database["public"]["Enums"]["payroll_funding_mechanism"]
          funding_payment_status?: Database["public"]["Enums"]["payroll_funding_status"]
          id?: string
          label?: string | null
          pesapal_funding_ref?: string | null
          pesapal_funding_url?: string | null
          pesapal_order_tracking_id?: string | null
          school_id?: string
          total_net_salaries?: number
          total_overhead_fees?: number
          total_payout_sum?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_batches_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          allowances: Json
          basic_salary: number
          created_at: string
          deductions: Json
          id: string
          is_deleted: boolean
          month: number
          net_salary: number | null
          nssf_employee: number | null
          nssf_employer: number | null
          paid_at: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payroll_payment_status"]
          school_id: string
          staff_id: string
          updated_at: string
          year: number
        }
        Insert: {
          allowances?: Json
          basic_salary: number
          created_at?: string
          deductions?: Json
          id?: string
          is_deleted?: boolean
          month: number
          net_salary?: number | null
          nssf_employee?: number | null
          nssf_employer?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payroll_payment_status"]
          school_id: string
          staff_id: string
          updated_at?: string
          year: number
        }
        Update: {
          allowances?: Json
          basic_salary?: number
          created_at?: string
          deductions?: Json
          id?: string
          is_deleted?: boolean
          month?: number
          net_salary?: number | null
          nssf_employee?: number | null
          nssf_employer?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payroll_payment_status"]
          school_id?: string
          staff_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      pesapal_token_cache: {
        Row: {
          expires_at: string
          id: string
          token: string
          updated_at: string
        }
        Insert: {
          expires_at: string
          id?: string
          token: string
          updated_at?: string
        }
        Update: {
          expires_at?: string
          id?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_queue: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          sent_at: string | null
          status: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          is_deleted: boolean
          p256dh: string
          school_id: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          is_deleted?: boolean
          p256dh: string
          school_id: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_deleted?: boolean
          p256dh?: string
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          owner_school_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_school_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          owner_school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_owner_school_id_fkey"
            columns: ["owner_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          credit_months: number
          id: string
          referral_code_id: string
          referred_school_id: string
          rewarded_at: string | null
        }
        Insert: {
          created_at?: string
          credit_months?: number
          id?: string
          referral_code_id: string
          referred_school_id: string
          rewarded_at?: string | null
        }
        Update: {
          created_at?: string
          credit_months?: number
          id?: string
          referral_code_id?: string
          referred_school_id?: string
          rewarded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_school_id_fkey"
            columns: ["referred_school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      report_cards: {
        Row: {
          academic_year_id: string
          average: number | null
          class_id: string | null
          class_size: number | null
          class_teacher_comment: string | null
          conduct_grade: Database["public"]["Enums"]["conduct_grade"] | null
          created_at: string
          headmaster_comment: string | null
          id: string
          is_deleted: boolean
          is_published: boolean
          pdf_url: string | null
          position_in_class: number | null
          school_id: string
          student_id: string
          term_id: string
          total_marks: number | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          average?: number | null
          class_id?: string | null
          class_size?: number | null
          class_teacher_comment?: string | null
          conduct_grade?: Database["public"]["Enums"]["conduct_grade"] | null
          created_at?: string
          headmaster_comment?: string | null
          id?: string
          is_deleted?: boolean
          is_published?: boolean
          pdf_url?: string | null
          position_in_class?: number | null
          school_id: string
          student_id: string
          term_id: string
          total_marks?: number | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          average?: number | null
          class_id?: string | null
          class_size?: number | null
          class_teacher_comment?: string | null
          conduct_grade?: Database["public"]["Enums"]["conduct_grade"] | null
          created_at?: string
          headmaster_comment?: string | null
          id?: string
          is_deleted?: boolean
          is_published?: boolean
          pdf_url?: string | null
          position_in_class?: number | null
          school_id?: string
          student_id?: string
          term_id?: string
          total_marks?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "report_cards_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      school_groups: {
        Row: {
          code: string
          created_at: string
          id: string
          is_deleted: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          name?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          africas_talking_api_key: string | null
          africas_talking_api_key_enc: string | null
          africas_talking_username: string | null
          africas_talking_username_enc: string | null
          country_code: string
          created_at: string
          district: string | null
          email: string | null
          group_id: string | null
          id: string
          is_deleted: boolean
          logo_url: string | null
          max_students: number
          motto: string | null
          name: string
          next_billing_date: string | null
          pesapal_consumer_key_enc: string | null
          pesapal_consumer_secret_enc: string | null
          pesapal_ipn_id: string | null
          pesapal_sandbox: boolean
          cash_on: boolean
          phone: string | null
          resend_api_key_enc: string | null
          school_code: string | null
          school_type: Database["public"]["Enums"]["school_type"]
          sms_sender_id: string
          subscription_plan: string
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          africas_talking_api_key?: string | null
          africas_talking_api_key_enc?: string | null
          africas_talking_username?: string | null
          africas_talking_username_enc?: string | null
          country_code?: string
          created_at?: string
          district?: string | null
          email?: string | null
          group_id?: string | null
          id?: string
          is_deleted?: boolean
          logo_url?: string | null
          max_students?: number
          motto?: string | null
          name: string
          next_billing_date?: string | null
          pesapal_consumer_key_enc?: string | null
          pesapal_consumer_secret_enc?: string | null
          pesapal_ipn_id?: string | null
          pesapal_sandbox?: boolean
          cash_on?: boolean
          phone?: string | null
          resend_api_key_enc?: string | null
          school_code?: string | null
          school_type?: Database["public"]["Enums"]["school_type"]
          sms_sender_id?: string
          subscription_plan?: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          africas_talking_api_key?: string | null
          africas_talking_api_key_enc?: string | null
          africas_talking_username?: string | null
          africas_talking_username_enc?: string | null
          country_code?: string
          created_at?: string
          district?: string | null
          email?: string | null
          group_id?: string | null
          id?: string
          is_deleted?: boolean
          logo_url?: string | null
          max_students?: number
          motto?: string | null
          name?: string
          next_billing_date?: string | null
          pesapal_consumer_key_enc?: string | null
          pesapal_consumer_secret_enc?: string | null
          pesapal_ipn_id?: string | null
          pesapal_sandbox?: boolean
          cash_on?: boolean
          phone?: string | null
          resend_api_key_enc?: string | null
          school_code?: string | null
          school_type?: Database["public"]["Enums"]["school_type"]
          sms_sender_id?: string
          subscription_plan?: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_configs"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "schools_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "school_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          africa_talking_message_id: string | null
          cost: number | null
          created_at: string
          error: string | null
          id: string
          is_deleted: boolean
          message_body: string | null
          message_type: string | null
          recipient_phone: string
          related_entity_id: string | null
          related_entity_type: string | null
          school_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["sms_status"]
          updated_at: string
        }
        Insert: {
          africa_talking_message_id?: string | null
          cost?: number | null
          created_at?: string
          error?: string | null
          id?: string
          is_deleted?: boolean
          message_body?: string | null
          message_type?: string | null
          recipient_phone: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          updated_at?: string
        }
        Update: {
          africa_talking_message_id?: string | null
          cost?: number | null
          created_at?: string
          error?: string | null
          id?: string
          is_deleted?: boolean
          message_body?: string | null
          message_type?: string | null
          recipient_phone?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          school_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["sms_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_default: boolean
          is_deleted: boolean
          name: string
          school_id: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          name: string
          school_id: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          name?: string
          school_id?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          bank_account: string | null
          bank_name: string | null
          basic_salary: number | null
          created_at: string
          employee_number: string
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          national_id: string | null
          nssf_number: string | null
          photo_url: string | null
          role: string | null
          role_title: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bank_account?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string
          employee_number: string
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          national_id?: string | null
          nssf_number?: string | null
          photo_url?: string | null
          role?: string | null
          role_title?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bank_account?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string
          employee_number?: string
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          national_id?: string | null
          nssf_number?: string | null
          photo_url?: string | null
          role?: string | null
          role_title?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payment_profiles: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_code: string | null
          bank_name: string | null
          created_at: string
          id: string
          mobile_number: string | null
          preferred_method: Database["public"]["Enums"]["staff_payout_method"]
          school_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          mobile_number?: string | null
          preferred_method?: Database["public"]["Enums"]["staff_payout_method"]
          school_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          mobile_number?: string | null
          preferred_method?: Database["public"]["Enums"]["staff_payout_method"]
          school_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payment_profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payment_profiles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      student_discounts: {
        Row: {
          approved_by: string | null
          created_at: string
          discount_id: string
          id: string
          is_deleted: boolean
          note: string | null
          school_id: string
          student_id: string
          term_id: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          discount_id: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          school_id: string
          student_id: string
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          discount_id?: string
          id?: string
          is_deleted?: boolean
          note?: string | null
          school_id?: string
          student_id?: string
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_discounts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "fee_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_discounts_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_number: string
          created_at: string
          current_class_id: string | null
          date_of_birth: string | null
          enrollment_date: string | null
          exit_date: string | null
          full_name: string
          gender: string | null
          id: string
          is_deleted: boolean
          parent_email: string | null
          parent_name: string | null
          parent_nid: string | null
          parent_phone: string | null
          photo_url: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          admission_number: string
          created_at?: string
          current_class_id?: string | null
          date_of_birth?: string | null
          enrollment_date?: string | null
          exit_date?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_deleted?: boolean
          parent_email?: string | null
          parent_name?: string | null
          parent_nid?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          admission_number?: string
          created_at?: string
          current_class_id?: string | null
          date_of_birth?: string | null
          enrollment_date?: string | null
          exit_date?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_deleted?: boolean
          parent_email?: string | null
          parent_name?: string | null
          parent_nid?: string | null
          parent_phone?: string | null
          photo_url?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_current_class_id_fkey"
            columns: ["current_class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "students_current_class_id_fkey"
            columns: ["current_class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_comments: {
        Row: {
          bot_comment: string | null
          created_at: string
          eot_comment: string | null
          id: string
          is_deleted: boolean
          mid_comment: string | null
          school_id: string
          student_id: string
          subject_id: string
          term_id: string
          updated_at: string
        }
        Insert: {
          bot_comment?: string | null
          created_at?: string
          eot_comment?: string | null
          id?: string
          is_deleted?: boolean
          mid_comment?: string | null
          school_id: string
          student_id: string
          subject_id: string
          term_id: string
          updated_at?: string
        }
        Update: {
          bot_comment?: string | null
          created_at?: string
          eot_comment?: string | null
          id?: string
          is_deleted?: boolean
          mid_comment?: string | null
          school_id?: string
          student_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_comments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_comments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_comments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_comments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          id: string
          is_deleted: boolean
          max_marks: number
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          max_marks?: number
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean
          max_marks?: number
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          is_deleted: boolean
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          pesapal_tx_id: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          revenue_by_plan: Json | null
          school_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          is_deleted?: boolean
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          pesapal_tx_id?: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          revenue_by_plan?: Json | null
          school_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          is_deleted?: boolean
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          pesapal_tx_id?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          revenue_by_plan?: Json | null
          school_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_class_assignments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          is_class_teacher: boolean
          is_deleted: boolean
          school_id: string
          subject_id: string | null
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          is_class_teacher?: boolean
          is_deleted?: boolean
          school_id: string
          subject_id?: string | null
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          is_class_teacher?: boolean
          is_deleted?: boolean
          school_id?: string
          subject_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_class_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          academic_year_id: string
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          is_deleted: boolean
          name: Database["public"]["Enums"]["term_name"]
          school_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          name: Database["public"]["Enums"]["term_name"]
          school_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          is_deleted?: boolean
          name?: Database["public"]["Enums"]["term_name"]
          school_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_messages: {
        Row: {
          at_message_id: string | null
          body: string
          direction: string
          id: string
          is_deleted: boolean
          school_id: string
          sender_name: string | null
          sent_at: string
          status: string
          thread_id: string
        }
        Insert: {
          at_message_id?: string | null
          body: string
          direction: string
          id?: string
          is_deleted?: boolean
          school_id: string
          sender_name?: string | null
          sent_at?: string
          status?: string
          thread_id: string
        }
        Update: {
          at_message_id?: string | null
          body?: string
          direction?: string
          id?: string
          is_deleted?: boolean
          school_id?: string
          sender_name?: string | null
          sent_at?: string
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_periods: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_break: boolean
          is_deleted: boolean
          name: string
          school_id: string
          sort_order: number
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_break?: boolean
          is_deleted?: boolean
          name: string
          school_id: string
          sort_order?: number
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_break?: boolean
          is_deleted?: boolean
          name?: string
          school_id?: string
          sort_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          academic_year_id: string | null
          class_id: string
          created_at: string
          day_of_week: number
          id: string
          is_deleted: boolean
          period_id: string
          room: string | null
          school_id: string
          subject_id: string | null
          teacher_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          class_id: string
          created_at?: string
          day_of_week: number
          id?: string
          is_deleted?: boolean
          period_id: string
          room?: string | null
          school_id: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          class_id?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_deleted?: boolean
          period_id?: string
          room?: string | null
          school_id?: string
          subject_id?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "timetable_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tuition_payments: {
        Row: {
          amount: number
          created_at: string
          fee_account_id: string | null
          fee_type_id: string | null
          fee_type_label: string | null
          id: string
          initiated_by_user_id: string | null
          payment_description: string | null
          pesapal_order_tracking_id: string | null
          pesapal_redirect_url: string | null
          receipt_number: string | null
          school_id: string
          status: Database["public"]["Enums"]["pesapal_payment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_account_id?: string | null
          fee_type_id?: string | null
          fee_type_label?: string | null
          id: string
          initiated_by_user_id?: string | null
          payment_description?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_redirect_url?: string | null
          receipt_number?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["pesapal_payment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_account_id?: string | null
          fee_type_id?: string | null
          fee_type_label?: string | null
          id?: string
          initiated_by_user_id?: string | null
          payment_description?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_redirect_url?: string | null
          receipt_number?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["pesapal_payment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tuition_payments_fee_account_id_fkey"
            columns: ["fee_account_id"]
            isOneToOne: false
            referencedRelation: "fee_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuition_payments_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuition_payments_initiated_by_user_id_fkey"
            columns: ["initiated_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuition_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuition_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_deleted: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          role_title: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          is_deleted?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_title?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_title?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      attendance_weekly_summary: {
        Row: {
          absent_count: number | null
          attendance_rate: number | null
          class_id: string | null
          class_name: string | null
          excused_count: number | null
          expected_school_days: number | null
          late_count: number | null
          present_count: number | null
          school_id: string | null
          total_records: number | null
          week_start: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_fee_summary: {
        Row: {
          class_id: string | null
          class_name: string | null
          collection_rate_pct: number | null
          school_id: string | null
          student_count: number | null
          total_balance: number | null
          total_expected: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_current_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "students_current_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_performance_summary: {
        Row: {
          avg_pct: number | null
          class_id: string | null
          class_name: string | null
          max_score: number | null
          min_score: number | null
          school_id: string | null
          student_count: number | null
          subject_id: string | null
          subject_name: string | null
          term_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "attendance_weekly_summary"
            referencedColumns: ["class_id"]
          },
          {
            foreignKeyName: "marks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_referral_credit: {
        Args: { p_code: string; p_new_school_id: string }
        Returns: Json
      }
      class_school_id: { Args: { p_class_id: string }; Returns: string }
      confirm_tuition_payment: {
        Args: {
          p_new_status: string
          p_pesapal_tracking_id: string
          p_tuition_payment_id: string
          p_verified_amount: number
        }
        Returns: undefined
      }
      create_fee_accounts_for_term: {
        Args: { p_school_id: string; p_term_id: string }
        Returns: number
      }
      decrement_available_copies: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      decrypt_secret: {
        Args: { encrypted: string; key: string }
        Returns: string
      }
      encrypt_secret: { Args: { key: string; secret: string }; Returns: string }
      generate_meeting_slots: {
        Args: {
          p_duration_minutes?: number
          p_end_time: string
          p_school_id: string
          p_slot_date: string
          p_start_time: string
          p_teacher_id: string
        }
        Returns: undefined
      }
      generate_receipt_number: {
        Args: { p_school_id: string }
        Returns: string
      }
      get_student_attendance_summary: {
        Args: { p_student_id: string; p_term_id: string }
        Returns: Json
      }
      get_student_current_results: {
        Args: { p_student_id: string; p_term_id: string }
        Returns: Json
      }
      get_student_fee_breakdown: {
        Args: { p_student_id: string; p_term_id: string }
        Returns: Json
      }
      get_student_fee_summary: {
        Args: { p_student_id: string; p_term_id: string }
        Returns: Json
      }
      get_user_group_school_ids: { Args: never; Returns: string[] }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_school_id: { Args: never; Returns: string }
      increment_available_copies: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      recalculate_fee_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      issue_library_book: {
        Args: {
          p_school_id: string
          p_book_id: string
          p_student_id: string
          p_due_date: string
          p_issued_by: string
        }
        Returns: Database["public"]["Tables"]["library_issues"]["Row"]
      }
      return_library_book: {
        Args: {
          p_school_id: string
          p_issue_id: string
          p_fine_amount?: number | null
          p_fine_paid?: boolean
        }
        Returns: Database["public"]["Tables"]["library_issues"]["Row"]
      }
      dashboard_attendance_by_class: {
        Args: { p_school_id: string; p_date: string }
        Returns: { class_id: string; present: number; total: number }[]
      }
      dashboard_attendance_today: {
        Args: { p_school_id: string; p_date: string }
        Returns: { present: number; total: number }[]
      }
      dashboard_payment_trend: {
        Args: { p_school_id: string; p_term_id: string }
        Returns: { week_start: string; amount: number }[]
      }
      dashboard_payment_methods: {
        Args: { p_school_id: string; p_term_id: string }
        Returns: { payment_method: string; amount: number }[]
      }
    }
    Enums: {
      announcement_target: "all" | "class" | "defaulters" | "custom"
      asset_condition: "excellent" | "good" | "fair" | "poor" | "written_off"
      attendance_status: "present" | "absent" | "late" | "excused"
      concierge_status:
        | "new"
        | "contacted"
        | "in_progress"
        | "completed"
        | "cancelled"
      conduct_grade: "A" | "B" | "C" | "D"
      disbursal_status: "HOLD_UNTIL_FUNDED" | "QUEUED" | "SUCCESS" | "FAILED"
      discipline_incident_type:
        | "misconduct"
        | "absence"
        | "violence"
        | "cheating"
        | "vandalism"
        | "verbal_warning"
        | "written_warning"
        | "detention"
        | "suspension"
        | "parent_called"
        | "referred_to_head"
        | "other"
      discount_type: "percentage" | "fixed_amount"
      exam_type: "bot" | "midterm" | "eot" | "assignment" | "practical"
      expense_payment_method: "cash" | "bank" | "mobile_money" | "cheque" | "waiver"
      fee_account_status: "paid" | "partial" | "unpaid" | "overpaid"
      marketplace_category: "sms_template" | "fee_structure" | "report_comment"
      mm_provider: "mtn" | "airtel"
      notification_channel: "IN_APP" | "SMS" | "EMAIL" | "PUSH"
      payment_method: "mobile_money" | "cash" | "bank" | "waiver"
      payment_status: "pending" | "confirmed" | "failed" | "reversed" | "refunded"
      payroll_funding_mechanism: "BANK_COLLECT" | "MOMO_PUSH"
      payroll_funding_status: "AWAITING_EXTERNAL_FUNDING" | "SUCCESS" | "FAILED"
      payroll_payment_status: "pending" | "paid"
      pesapal_payment_status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED"
      report_card_status: "not_started" | "draft" | "submitted" | "approved"
      school_type: "primary" | "secondary" | "both" | "nursery"
      sms_channel: "sms" | "email" | "in_app" | "push"
      sms_status: "pending" | "sent" | "delivered" | "failed"
      staff_payout_method: "MOBILE_MONEY" | "BANK" | "CASH"
      student_status: "active" | "left" | "graduated"
      subscription_plan: "starter" | "growth" | "pro" | "trial"
      subscription_status: "active" | "past_due" | "cancelled" | "trial"
      term_name: "Term1" | "Term2" | "Term3"
      user_role:
        | "SUPER_ADMIN"
        | "SCHOOL_ADMIN"
        | "BURSAR"
        | "TEACHER"
        | "PARENT"
        | "GROUP_ADMIN"
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
      announcement_target: ["all", "class", "defaulters", "custom"],
      asset_condition: ["excellent", "good", "fair", "poor", "written_off"],
      attendance_status: ["present", "absent", "late", "excused"],
      concierge_status: [
        "new",
        "contacted",
        "in_progress",
        "completed",
        "cancelled",
      ],
      conduct_grade: ["A", "B", "C", "D"],
      disbursal_status: ["HOLD_UNTIL_FUNDED", "QUEUED", "SUCCESS", "FAILED"],
      discipline_incident_type: [
        "misconduct",
        "absence",
        "violence",
        "cheating",
        "vandalism",
        "other",
      ],
      discount_type: ["percentage", "fixed_amount"],
      exam_type: ["bot", "midterm", "eot", "assignment", "practical"],
      expense_payment_method: ["cash", "bank", "mobile_money", "cheque", "waiver"],
      fee_account_status: ["paid", "partial", "unpaid", "overpaid"],
      marketplace_category: ["sms_template", "fee_structure", "report_comment"],
      mm_provider: ["mtn", "airtel"],
      notification_channel: ["IN_APP", "SMS", "EMAIL", "PUSH"],
      payment_method: ["mobile_money", "cash", "bank", "waiver"],
      payment_status: ["pending", "confirmed", "failed", "reversed", "refunded"],
      payroll_funding_mechanism: ["BANK_COLLECT", "MOMO_PUSH"],
      payroll_funding_status: [
        "AWAITING_EXTERNAL_FUNDING",
        "SUCCESS",
        "FAILED",
      ],
      payroll_payment_status: ["pending", "paid"],
      pesapal_payment_status: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
      report_card_status: ["not_started", "draft", "submitted", "approved"],
      school_type: ["primary", "secondary", "both"],
      sms_channel: ["sms", "email", "in_app", "push"],
      sms_status: ["pending", "sent", "delivered", "failed"],
      staff_payout_method: ["MOBILE_MONEY", "BANK", "CASH"],
      student_status: ["active", "left", "graduated"],
      subscription_plan: ["starter", "growth", "pro", "trial"],
      subscription_status: ["active", "past_due", "cancelled", "trial"],
      term_name: ["Term1", "Term2", "Term3"],
      user_role: [
        "SUPER_ADMIN",
        "SCHOOL_ADMIN",
        "BURSAR",
        "TEACHER",
        "PARENT",
        "GROUP_ADMIN",
      ],
    },
  },
} as const