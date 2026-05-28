import { z } from 'zod';

export const createFeeStructureSchema = z.object({
  term_id: z.string().uuid('Select a term'),
  class_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1, 'Fee name is required'),
  amount: z.number().positive('Amount must be greater than 0'),
  is_mandatory: z.boolean().default(true),
});

export const recordPaymentSchema = z.object({
  student_id: z.string().uuid('Select a student'),
  amount: z.number().positive('Amount must be greater than 0'),
  payment_method: z.enum(['mobile_money', 'cash', 'bank', 'waiver']),
  mobile_money_provider: z.enum(['mtn', 'airtel']).optional().nullable(),
  phone_used: z.string().optional().nullable(),
  mobile_money_transaction_id: z.string().optional().nullable(),
  payment_date: z.string().default(() => new Date().toISOString().split('T')[0]),
  notes: z.string().optional().nullable(),
}).refine(
  (data) => {
    if (data.payment_method === 'mobile_money') {
      return !!data.mobile_money_provider && !!data.phone_used;
    }
    return true;
  },
  {
    message: 'Mobile money provider and phone number are required for mobile money payments',
    path: ['mobile_money_provider'],
  }
);

export const generateFeeAccountsSchema = z.object({
  term_id: z.string().uuid('Select a term'),
  class_id: z.string().uuid().optional().nullable(),
});

export const feeStatementSchema = z.object({
  student_id: z.string().uuid(),
  term_id: z.string().uuid().optional(),
});

export const createDiscountSchema = z.object({
  name: z.string().min(1, 'Discount name is required'),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  value: z.number().positive('Value must be greater than 0'),
  max_amount: z.number().positive().nullable().optional(),
  is_recurring: z.boolean().default(true),
});

export const applyDiscountSchema = z.object({
  student_id: z.string().uuid('Select a student'),
  discount_id: z.string().uuid('Select a discount'),
  term_id: z.string().uuid().nullable(),
  note: z.string().optional().nullable(),
});

export type CreateFeeStructureFormData = z.infer<typeof createFeeStructureSchema>;
export type RecordPaymentFormData = z.infer<typeof recordPaymentSchema>;
export type GenerateFeeAccountsFormData = z.infer<typeof generateFeeAccountsSchema>;
export type CreateDiscountFormData = z.infer<typeof createDiscountSchema>;
export type ApplyDiscountFormData = z.infer<typeof applyDiscountSchema>;

// Legacy aliases
export const feeStructureSchema = createFeeStructureSchema;
export const paymentSchema = recordPaymentSchema;
export const generateAccountsSchema = generateFeeAccountsSchema;
export type FeeStructureFormData = CreateFeeStructureFormData;
export type PaymentFormData = RecordPaymentFormData;
