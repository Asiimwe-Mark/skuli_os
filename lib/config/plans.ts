export const PLAN_CONFIG = {
  trial: {
    name: 'Trial',
    price_ugx: 0,
    max_students: 50,
    features: [
      '50 students',
      'Basic reports',
      'SMS (pay-as-you-go)',
      'Email support',
    ],
    highlight: false,
  },
  starter: {
    name: 'Starter',
    price_ugx: 150_000,
    max_students: 200,
    features: [
      'Up to 200 students',
      'Fee collection & receipts',
      'Attendance tracking',
      'Report cards',
      'Parent portal (PWA)',
      'SMS notifications',
      'Email support',
    ],
    highlight: false,
  },
  growth: {
    name: 'Growth',
    price_ugx: 350_000,
    max_students: 500,
    features: [
      'Up to 500 students',
      'Everything in Starter',
      'Mobile money (MTN & Airtel)',
      'Timetable builder',
      'Staff & payroll',
      'Library management',
      'Asset inventory',
      'Priority support',
    ],
    highlight: true,
  },
  pro: {
    name: 'Pro',
    price_ugx: 750_000,
    max_students: 99_999,
    features: [
      'Unlimited students',
      'Everything in Growth',
      'Multi-school group admin',
      'Advanced analytics',
      'Custom report builder',
      'EMIS report export',
      'Dedicated account manager',
    ],
    highlight: false,
  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;

// Convenience map of plan key -> price for server-side lookups.
export const PLAN_PRICES_UGX: Record<PlanKey, number> = {
  trial: PLAN_CONFIG.trial.price_ugx,
  starter: PLAN_CONFIG.starter.price_ugx,
  growth: PLAN_CONFIG.growth.price_ugx,
  pro: PLAN_CONFIG.pro.price_ugx,
};
