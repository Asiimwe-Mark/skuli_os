import { z } from 'zod';

export const sendSmsSchema = z.object({
  target_audience: z.enum(['all', 'class', 'defaulters', 'custom']),
  target_class_ids: z.array(z.string().uuid()).optional(),
  custom_phones: z.array(z.string()).optional(),
  channels: z.object({
    sms: z.boolean().default(true),
    in_app: z.boolean().default(false),
  }),
  message_body: z.string().min(1, 'Message is required').max(1600, 'Message too long'),
  title: z.string().optional(),
  schedule: z.enum(['now', 'later']).default('now'),
  scheduled_at: z.string().optional().nullable(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  body: z.string().min(1, 'Message body is required'),
  message_type: z.string(),
});

export type SendSmsFormData = z.infer<typeof sendSmsSchema>;
export type CreateTemplateFormData = z.infer<typeof createTemplateSchema>;

// Legacy aliases
export const sendMessageSchema = sendSmsSchema;
export const smsTemplateSchema = createTemplateSchema;
export type SendMessageFormData = SendSmsFormData;
export type SmsTemplateFormData = CreateTemplateFormData;
