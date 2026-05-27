/**
 * Supabase Database types.
 * Manually maintained to match migrations.
 */

import type {
  UserRole,
  SubscriptionPlan,
  SubscriptionStatus,
  TermName,
  StudentStatus,
  PaymentMethod,
  MobileMoneyProvider,
  PaymentStatus,
  ExamType,
  AttendanceStatus,
  TargetAudience,
  SmsStatus,
  PayrollPaymentStatus,
  FeeAccountStatus,
  ConductGrade,
} from './index';

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          address: string | null;
          district: string | null;
          phone: string | null;
          email: string | null;
          motto: string | null;
          school_type: string;
          school_code: string;
          subscription_plan: SubscriptionPlan;
          subscription_status: SubscriptionStatus;
          trial_ends_at: string | null;
          max_students: number;
          africas_talking_username: string | null;
          africas_talking_api_key: string | null;
          africas_talking_api_key_enc: string | null;
          africas_talking_username_enc: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['schools']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['schools']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          school_id: string | null;
          role: UserRole;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      academic_years: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          is_current: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['academic_years']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['academic_years']['Insert']>;
      };
      terms: {
        Row: {
          id: string;
          school_id: string;
          academic_year_id: string;
          name: TermName;
          start_date: string;
          end_date: string;
          is_current: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['terms']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['terms']['Insert']>;
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          level: string | null;
          stream: string | null;
          class_teacher_id: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['classes']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['classes']['Insert']>;
      };
      subjects: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          code: string;
          max_marks: number;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['subjects']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>;
      };
      class_subjects: {
        Row: {
          id: string;
          class_id: string;
          subject_id: string;
          teacher_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['class_subjects']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['class_subjects']['Insert']>;
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          admission_number: string;
          full_name: string;
          date_of_birth: string | null;
          gender: string | null;
          photo_url: string | null;
          parent_name: string;
          parent_phone: string;
          parent_email: string | null;
          parent_nid: string | null;
          current_class_id: string | null;
          enrollment_date: string;
          status: StudentStatus;
          exit_date: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['students']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['students']['Insert']>;
      };
      class_enrollments: {
        Row: {
          id: string;
          student_id: string;
          class_id: string;
          term_id: string;
          academic_year_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['class_enrollments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['class_enrollments']['Insert']>;
      };
      fee_structures: {
        Row: {
          id: string;
          school_id: string;
          term_id: string;
          class_id: string | null;
          name: string;
          amount: number;
          is_mandatory: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['fee_structures']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['fee_structures']['Insert']>;
      };
      fee_accounts: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          term_id: string;
          academic_year_id: string;
          total_expected: number;
          total_paid: number;
          balance: number;
          status: FeeAccountStatus;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['fee_accounts']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['fee_accounts']['Insert']>;
      };
      fee_payments: {
        Row: {
          id: string;
          school_id: string;
          fee_account_id: string;
          student_id: string;
          amount: number;
          payment_method: PaymentMethod;
          mobile_money_provider: MobileMoneyProvider | null;
          mobile_money_transaction_id: string | null;
          phone_used: string | null;
          received_by_user_id: string | null;
          payment_date: string;
          notes: string | null;
          receipt_number: string;
          status: PaymentStatus;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['fee_payments']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['fee_payments']['Insert']>;
      };
      marks: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          subject_id: string;
          class_id: string;
          term_id: string;
          academic_year_id: string;
          exam_type: ExamType;
          score: number;
          max_score: number;
          entered_by: string | null;
          remarks: string | null;
          review_status: string;
          review_comment: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['marks']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['marks']['Insert']>;
      };
      report_cards: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          term_id: string;
          academic_year_id: string;
          total_marks: number | null;
          average: number | null;
          position_in_class: number | null;
          class_size: number | null;
          class_teacher_comment: string | null;
          headmaster_comment: string | null;
          conduct_grade: ConductGrade | null;
          is_published: boolean;
          pdf_url: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['report_cards']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['report_cards']['Insert']>;
      };
      attendance_records: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_id: string;
          date: string;
          status: AttendanceStatus;
          marked_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['attendance_records']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['attendance_records']['Insert']>;
      };
      announcements: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          body: string;
          target_audience: TargetAudience;
          target_class_ids: string[];
          sent_via: string;
          scheduled_at: string | null;
          scheduled_status: string;
          sent_at: string | null;
          sent_by: string | null;
          sms_cost: number | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['announcements']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>;
      };
      sms_logs: {
        Row: {
          id: string;
          school_id: string;
          recipient_phone: string;
          message_body: string;
          message_type: string | null;
          status: SmsStatus;
          africa_talking_message_id: string | null;
          cost: number | null;
          sent_at: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sms_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['sms_logs']['Insert']>;
      };
      staff: {
        Row: {
          id: string;
          school_id: string;
          user_id: string | null;
          employee_number: string;
          full_name: string;
          role_title: string;
          national_id: string | null;
          bank_name: string | null;
          bank_account: string | null;
          nssf_number: string | null;
          basic_salary: number;
          hire_date: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['staff']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['staff']['Insert']>;
      };
      payroll_records: {
        Row: {
          id: string;
          school_id: string;
          staff_id: string;
          month: number;
          year: number;
          basic_salary: number;
          allowances: Record<string, number>;
          deductions: Record<string, number>;
          nssf_employee: number;
          nssf_employer: number;
          net_salary: number;
          payment_status: PayrollPaymentStatus;
          paid_at: string | null;
          payment_method: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['payroll_records']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['payroll_records']['Insert']>;
      };
      subscription_invoices: {
        Row: {
          id: string;
          school_id: string;
          flutterwave_tx_id: string | null;
          plan: SubscriptionPlan;
          amount: number;
          currency: string;
          period_start: string;
          period_end: string;
          status: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['subscription_invoices']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['subscription_invoices']['Insert']>;
      };
      audit_logs: {
        Row: {
          id: string;
          school_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_value: Record<string, unknown> | null;
          new_value: Record<string, unknown> | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
      };
      notification_preferences: {
        Row: {
          id: string;
          school_id: string;
          send_receipt_sms: boolean;
          send_absence_sms: boolean;
          send_weekly_defaulter: boolean;
          defaulter_reminder_day: number;
          defaulter_reminder_hour: number;
          send_report_card_sms: boolean;
          send_term_start_sms: boolean;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['notification_preferences']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['notification_preferences']['Insert']>;
      };
      fee_structure_audit_log: {
        Row: {
          id: string;
          school_id: string;
          fee_structure_id: string;
          changed_by: string | null;
          action: string;
          old_value: Record<string, unknown> | null;
          new_value: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['fee_structure_audit_log']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['fee_structure_audit_log']['Insert']>;
      };
      in_app_notifications: {
        Row: {
          id: string;
          school_id: string;
          recipient_user_id: string;
          title: string;
          body: string | null;
          type: string;
          is_read: boolean;
          related_entity_type: string | null;
          related_entity_id: string | null;
          created_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['in_app_notifications']['Row'], 'id' | 'created_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['in_app_notifications']['Insert']>;
      };
      grading_scales: {
        Row: {
          id: string;
          school_id: string;
          grade: string;
          min_score: number;
          max_score: number;
          label: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          is_deleted: boolean;
        };
        Insert: Omit<Database['public']['Tables']['grading_scales']['Row'], 'id' | 'created_at' | 'updated_at' | 'is_deleted'>;
        Update: Partial<Database['public']['Tables']['grading_scales']['Insert']>;
      };
      platform_settings: {
        Row: {
          key: string;
          value: Record<string, unknown>;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Database['public']['Tables']['platform_settings']['Row'];
        Update: Partial<Database['public']['Tables']['platform_settings']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_school_id: { Returns: string };
      get_user_role: { Returns: UserRole };
      is_admin: { Returns: boolean };
      can_view_fees: { Returns: boolean };
      can_enter_marks: { Returns: boolean };
      recalculate_fee_account: { Args: { account_id: string }; Returns: void };
      encrypt_secret: { Args: { secret: string; key: string }; Returns: string };
      decrypt_secret: { Args: { encrypted: string; key: string }; Returns: string };
    };
    Enums: {
      user_role: UserRole;
      subscription_plan: SubscriptionPlan;
      subscription_status: SubscriptionStatus;
      term_name: TermName;
      student_status: StudentStatus;
      payment_method: PaymentMethod;
      mm_provider: MobileMoneyProvider;
      payment_status: PaymentStatus;
      exam_type: ExamType;
      attendance_status: AttendanceStatus;
      target_audience: TargetAudience;
      sms_status: SmsStatus;
      payroll_payment_status: PayrollPaymentStatus;
      fee_account_status: FeeAccountStatus;
      conduct_grade: ConductGrade;
    };
  };
}
