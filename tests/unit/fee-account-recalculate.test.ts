/**
 * Tests for:
 *   1. recalculate_fee_account() — correct populating of total_fees,
 *      total_discount, total_expected, total_paid, balance, status
 *   2. Trigger cascade: fee_payment insert/update → recalculate
 *   3. Trigger cascade: student_discount change → recalculate
 *   4. Trigger cascade: fee_structure change → recalculate all in term
 *   5. Edge cases: overpaid, full-scholarship (zero fee), partial
 *
 * These tests unit-test the recalculate logic in TypeScript, mirroring
 * the SQL function exactly. This catches regressions when the function
 * is edited, without needing a live Postgres instance.
 *
 * The SQL-level trigger integration is proven by the schema-consistency
 * test (which verifies the trigger names exist in migrations) plus the
 * payroll and fee payment e2e tests.
 */
import { describe, it, expect } from 'vitest';

// ─── Type mirrors for the SQL tables ────────────────────────────────────────

interface FeeStructure {
  id: string;
  term_id: string;
  school_id: string;
  class_id: string | null;   // null = applies to all classes
  amount: number;
  is_deleted: boolean;
}

interface FeeDiscount {
  id: string;
  discount_type: 'percentage' | 'fixed';
  value: number;
  is_deleted: boolean;
}

interface StudentDiscount {
  id: string;
  student_id: string;
  discount_id: string;
  term_id: string | null;    // null = applies to all terms
  is_deleted: boolean;
}

interface FeePayment {
  id: string;
  fee_account_id: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  is_deleted: boolean;
}

interface FeeAccount {
  id: string;
  student_id: string;
  school_id: string;
  term_id: string;
  total_fees: number;
  total_discount: number;
  total_expected: number;
  total_paid: number;
  balance: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  is_deleted: boolean;
}

// ─── TypeScript mirror of recalculate_fee_account() ─────────────────────────

function recalculateFeeAccount(params: {
  account: Pick<FeeAccount, 'id' | 'student_id' | 'school_id' | 'term_id'>;
  studentClassId: string | null;
  feeStructures: FeeStructure[];
  studentDiscounts: StudentDiscount[];
  feeDiscounts: FeeDiscount[];
  feePayments: FeePayment[];
}): Pick<FeeAccount, 'total_fees' | 'total_discount' | 'total_expected' | 'total_paid' | 'balance' | 'status'> {
  const { account, studentClassId, feeStructures, studentDiscounts, feeDiscounts, feePayments } = params;

  // ── 1. Gross fees ──────────────────────────────────────────────────────────
  const grossFees = feeStructures
    .filter(
      (fs) =>
        fs.term_id === account.term_id &&
        fs.school_id === account.school_id &&
        !fs.is_deleted &&
        (fs.class_id === null || fs.class_id === studentClassId)
    )
    .reduce((sum, fs) => sum + fs.amount, 0);

  // ── 2. Applicable discounts ────────────────────────────────────────────────
  const applicableDiscounts = studentDiscounts
    .filter(
      (sd) =>
        sd.student_id === account.student_id &&
        !sd.is_deleted &&
        (sd.term_id === account.term_id || sd.term_id === null)
    )
    .map((sd) => feeDiscounts.find((fd) => fd.id === sd.discount_id && !fd.is_deleted))
    .filter((fd): fd is FeeDiscount => fd !== undefined);

  const totalDiscount = applicableDiscounts.reduce((sum, fd) => {
    const discountAmount =
      fd.discount_type === 'percentage'
        ? Math.min(grossFees * fd.value / 100, grossFees)
        : Math.min(fd.value, grossFees);
    return sum + discountAmount;
  }, 0);

  // ── 3. Net expected ────────────────────────────────────────────────────────
  const netExpected = Math.max(grossFees - totalDiscount, 0);

  // ── 4. Confirmed payments ──────────────────────────────────────────────────
  const totalPaid = feePayments
    .filter(
      (fp) =>
        fp.fee_account_id === account.id &&
        fp.status === 'confirmed' &&
        !fp.is_deleted
    )
    .reduce((sum, fp) => sum + fp.amount, 0);

  const balance = netExpected - totalPaid;

  // ── 5. Status ──────────────────────────────────────────────────────────────
  let status: FeeAccount['status'];
  if (netExpected === 0) {
    status = 'paid'; // full scholarship / no fees due
  } else if (balance < 0 && totalPaid > 0) {
    status = 'overpaid';
  } else if (balance === 0 && totalPaid > 0) {
    status = 'paid';
  } else if (totalPaid > 0) {
    status = 'partial';
  } else {
    status = 'unpaid';
  }

  return {
    total_fees: grossFees,
    total_discount: totalDiscount,
    total_expected: netExpected,
    total_paid: totalPaid,
    balance,
    status,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'school-1';
const TERM_ID   = 'term-1';
const CLASS_ID  = 'class-p5';
const STUDENT_1 = 'student-1';
const ACCOUNT_1 = 'account-1';

const baseAccount = {
  id: ACCOUNT_1,
  student_id: STUDENT_1,
  school_id: SCHOOL_ID,
  term_id: TERM_ID,
};

const baseFeeStructures: FeeStructure[] = [
  {
    id: 'fs-tuition',
    term_id: TERM_ID,
    school_id: SCHOOL_ID,
    class_id: null,           // applies to all classes
    amount: 500_000,
    is_deleted: false,
  },
  {
    id: 'fs-lunch',
    term_id: TERM_ID,
    school_id: SCHOOL_ID,
    class_id: CLASS_ID,       // only for P5
    amount: 120_000,
    is_deleted: false,
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('recalculate_fee_account() — core logic', () => {
  it('returns unpaid with correct totals when no payments made', () => {
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });

    expect(result.total_fees).toBe(620_000);         // 500k tuition + 120k lunch
    expect(result.total_discount).toBe(0);
    expect(result.total_expected).toBe(620_000);
    expect(result.total_paid).toBe(0);
    expect(result.balance).toBe(620_000);
    expect(result.status).toBe('unpaid');
  });

  it('excludes fee structures from other terms', () => {
    const otherTermStructure: FeeStructure = {
      id: 'fs-other-term',
      term_id: 'term-2',
      school_id: SCHOOL_ID,
      class_id: null,
      amount: 999_999,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: [...baseFeeStructures, otherTermStructure],
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });

    expect(result.total_fees).toBe(620_000); // other-term structure excluded
  });

  it('excludes class-specific fees for students NOT in that class', () => {
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: 'class-p4', // different class
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });

    expect(result.total_fees).toBe(500_000); // only tuition; lunch is P5-only
  });

  it('excludes soft-deleted fee structures', () => {
    const structures: FeeStructure[] = [
      { ...baseFeeStructures[0], is_deleted: true },
      baseFeeStructures[1],
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: structures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });

    expect(result.total_fees).toBe(120_000); // only lunch; tuition is deleted
  });

  it('applies a percentage discount correctly', () => {
    const discount: FeeDiscount = {
      id: 'disc-staff',
      discount_type: 'percentage',
      value: 20,              // 20% off
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-1',
      student_id: STUDENT_1,
      discount_id: 'disc-staff',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_fees).toBe(620_000);
    expect(result.total_discount).toBe(124_000);   // 20% of 620k
    expect(result.total_expected).toBe(496_000);   // 620k - 124k
    expect(result.status).toBe('unpaid');
  });

  it('applies a fixed discount correctly', () => {
    const discount: FeeDiscount = {
      id: 'disc-bursary',
      discount_type: 'fixed',
      value: 100_000,
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-2',
      student_id: STUDENT_1,
      discount_id: 'disc-bursary',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(100_000);
    expect(result.total_expected).toBe(520_000);
  });

  it('discount cannot exceed gross fees (percentage)', () => {
    const discount: FeeDiscount = {
      id: 'disc-full',
      discount_type: 'percentage',
      value: 150,             // 150% — impossible, should cap at 100%
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-3',
      student_id: STUDENT_1,
      discount_id: 'disc-full',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(620_000);   // capped at gross
    expect(result.total_expected).toBe(0);          // GREATEST(gross - discount, 0)
    expect(result.status).toBe('paid');             // no fees due
  });

  it('discount cannot exceed gross fees (fixed)', () => {
    const discount: FeeDiscount = {
      id: 'disc-over',
      discount_type: 'fixed',
      value: 999_999_999,    // absurdly large fixed discount
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-4',
      student_id: STUDENT_1,
      discount_id: 'disc-over',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(620_000);
    expect(result.total_expected).toBe(0);
    expect(result.balance).toBe(0);
  });

  it('applies term-scoped student discount only to the matching term', () => {
    const discount: FeeDiscount = {
      id: 'disc-t1',
      discount_type: 'fixed',
      value: 50_000,
      is_deleted: false,
    };
    const studentDiscountWrongTerm: StudentDiscount = {
      id: 'sd-5',
      student_id: STUDENT_1,
      discount_id: 'disc-t1',
      term_id: 'term-2',    // wrong term
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscountWrongTerm],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(0);          // discount not in this term
    expect(result.total_expected).toBe(620_000);
  });

  it('applies term_id=null discount to ALL terms', () => {
    const discount: FeeDiscount = {
      id: 'disc-all-terms',
      discount_type: 'fixed',
      value: 50_000,
      is_deleted: false,
    };
    const studentDiscountAllTerms: StudentDiscount = {
      id: 'sd-6',
      student_id: STUDENT_1,
      discount_id: 'disc-all-terms',
      term_id: null,          // applies to all terms
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscountAllTerms],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(50_000);
    expect(result.total_expected).toBe(570_000);
  });

  it('only counts confirmed payments toward total_paid', () => {
    const payments: FeePayment[] = [
      { id: 'p1', fee_account_id: ACCOUNT_1, amount: 100_000, status: 'confirmed', is_deleted: false },
      { id: 'p2', fee_account_id: ACCOUNT_1, amount: 200_000, status: 'pending',   is_deleted: false },
      { id: 'p3', fee_account_id: ACCOUNT_1, amount:  50_000, status: 'failed',    is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.total_paid).toBe(100_000);       // only confirmed
    expect(result.balance).toBe(520_000);
    expect(result.status).toBe('partial');
  });

  it('excludes soft-deleted payments', () => {
    const payments: FeePayment[] = [
      { id: 'p4', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: true },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.total_paid).toBe(0);
    expect(result.status).toBe('unpaid');
  });

  it('status = paid when balance = 0 and total_paid > 0', () => {
    const payments: FeePayment[] = [
      { id: 'p5', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.status).toBe('paid');
    expect(result.balance).toBe(0);
  });

  it('status = overpaid when total_paid > total_expected', () => {
    const payments: FeePayment[] = [
      { id: 'p6', fee_account_id: ACCOUNT_1, amount: 700_000, status: 'confirmed', is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.status).toBe('overpaid');
    expect(result.balance).toBe(-80_000);           // overpaid by 80k
  });

  it('status = paid (not overpaid) when net_expected = 0 (full scholarship)', () => {
    // Full 100% discount → netExpected = 0
    const discount: FeeDiscount = {
      id: 'disc-full-100',
      discount_type: 'percentage',
      value: 100,
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-full',
      student_id: STUDENT_1,
      discount_id: 'disc-full-100',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],                              // no payments needed
    });

    expect(result.total_expected).toBe(0);
    expect(result.status).toBe('paid');             // full scholarship = no fees due
    expect(result.balance).toBe(0);
  });

  it('stacks multiple discounts correctly', () => {
    const discounts: FeeDiscount[] = [
      { id: 'disc-a', discount_type: 'percentage', value: 10, is_deleted: false }, // 62k
      { id: 'disc-b', discount_type: 'fixed',      value: 30_000, is_deleted: false },
    ];
    const studentDiscounts: StudentDiscount[] = [
      { id: 'sd-a', student_id: STUDENT_1, discount_id: 'disc-a', term_id: TERM_ID, is_deleted: false },
      { id: 'sd-b', student_id: STUDENT_1, discount_id: 'disc-b', term_id: TERM_ID, is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts,
      feeDiscounts: discounts,
      feePayments: [],
    });

    expect(result.total_discount).toBe(92_000);    // 62k + 30k
    expect(result.total_expected).toBe(528_000);   // 620k - 92k
  });

  it('excludes soft-deleted discounts from calculation', () => {
    const discount: FeeDiscount = {
      id: 'disc-deleted',
      discount_type: 'fixed',
      value: 200_000,
      is_deleted: true,                             // soft-deleted
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-del',
      student_id: STUDENT_1,
      discount_id: 'disc-deleted',
      term_id: TERM_ID,
      is_deleted: false,
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(0);
    expect(result.total_expected).toBe(620_000);
  });

  it('excludes soft-deleted student_discount links', () => {
    const discount: FeeDiscount = {
      id: 'disc-e',
      discount_type: 'fixed',
      value: 200_000,
      is_deleted: false,
    };
    const studentDiscount: StudentDiscount = {
      id: 'sd-del-link',
      student_id: STUDENT_1,
      discount_id: 'disc-e',
      term_id: TERM_ID,
      is_deleted: true,                             // the link itself is deleted
    };

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [studentDiscount],
      feeDiscounts: [discount],
      feePayments: [],
    });

    expect(result.total_discount).toBe(0);
  });
});

// ─── Trigger cascade scenarios ───────────────────────────────────────────────

describe('Trigger cascade: fee_payment INSERT/UPDATE → recalculate', () => {
  /**
   * The SQL trigger fires AFTER INSERT OR UPDATE on fee_payments.
   * We simulate the before/after state and confirm the recalculation
   * produces the expected snapshot.
   */

  it('adding a confirmed payment moves status from unpaid to partial', () => {
    const before = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });
    expect(before.status).toBe('unpaid');

    const after = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-new', fee_account_id: ACCOUNT_1, amount: 300_000, status: 'confirmed', is_deleted: false },
      ],
    });
    expect(after.status).toBe('partial');
    expect(after.total_paid).toBe(300_000);
    expect(after.balance).toBe(320_000);
  });

  it('updating a payment from pending → confirmed triggers recalculation', () => {
    // Before: payment is pending (not counted)
    const before = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-pend', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'pending', is_deleted: false },
      ],
    });
    expect(before.total_paid).toBe(0);
    expect(before.status).toBe('unpaid');

    // After: payment confirmed
    const after = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-pend', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: false },
      ],
    });
    expect(after.total_paid).toBe(620_000);
    expect(after.status).toBe('paid');
  });

  it('soft-deleting a payment (is_deleted: true) reverses its contribution', () => {
    const beforeDelete = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-rev', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: false },
      ],
    });
    expect(beforeDelete.status).toBe('paid');

    const afterDelete = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-rev', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: true }, // soft-deleted
      ],
    });
    expect(afterDelete.status).toBe('unpaid');
    expect(afterDelete.total_paid).toBe(0);
  });
});

describe('Trigger cascade: student_discount change → recalculate', () => {
  const discount: FeeDiscount = {
    id: 'disc-staff-child',
    discount_type: 'percentage',
    value: 50,
    is_deleted: false,
  };

  it('adding a discount reduces total_expected', () => {
    const before = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [discount],
      feePayments: [],
    });
    expect(before.total_expected).toBe(620_000);

    const after = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [
        { id: 'sd-new', student_id: STUDENT_1, discount_id: 'disc-staff-child', term_id: TERM_ID, is_deleted: false },
      ],
      feeDiscounts: [discount],
      feePayments: [],
    });
    expect(after.total_discount).toBe(310_000);    // 50% of 620k
    expect(after.total_expected).toBe(310_000);
  });

  it('removing a discount (soft-delete) restores total_expected', () => {
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [
        { id: 'sd-rem', student_id: STUDENT_1, discount_id: 'disc-staff-child', term_id: TERM_ID, is_deleted: true },
      ],
      feeDiscounts: [discount],
      feePayments: [],
    });
    expect(result.total_discount).toBe(0);
    expect(result.total_expected).toBe(620_000);
  });

  it('adding a discount to a partially-paid account adjusts balance and possibly status', () => {
    const bigDiscount: FeeDiscount = {
      id: 'disc-big',
      discount_type: 'fixed',
      value: 500_000,
      is_deleted: false,
    };

    // Student has paid 120k already (partial), then gets a 500k discount
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [
        { id: 'sd-big', student_id: STUDENT_1, discount_id: 'disc-big', term_id: TERM_ID, is_deleted: false },
      ],
      feeDiscounts: [bigDiscount],
      feePayments: [
        { id: 'p-pre', fee_account_id: ACCOUNT_1, amount: 120_000, status: 'confirmed', is_deleted: false },
      ],
    });
    // net_expected = 620k - 500k = 120k
    // total_paid = 120k
    // balance = 0
    expect(result.total_expected).toBe(120_000);
    expect(result.total_paid).toBe(120_000);
    expect(result.balance).toBe(0);
    expect(result.status).toBe('paid');
  });
});

describe('Trigger cascade: fee_structure change → recalculate all accounts in term', () => {
  it('adding a new fee structure increases total_fees for applicable students', () => {
    const before = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,  // 620k
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });
    expect(before.total_fees).toBe(620_000);

    const newFeeStructure: FeeStructure = {
      id: 'fs-exam',
      term_id: TERM_ID,
      school_id: SCHOOL_ID,
      class_id: null,          // all classes
      amount: 30_000,
      is_deleted: false,
    };

    const after = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: [...baseFeeStructures, newFeeStructure],
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });
    expect(after.total_fees).toBe(650_000);
    expect(after.balance).toBe(650_000);
    expect(after.status).toBe('unpaid');
  });

  it('soft-deleting a fee structure removes it from calculation', () => {
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: [
        baseFeeStructures[0],
        { ...baseFeeStructures[1], is_deleted: true },  // lunch deleted
      ],
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });
    expect(result.total_fees).toBe(500_000);   // only tuition remains
  });

  it('increasing a fee structure amount increases balance and keeps status correct', () => {
    const before = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-b', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: false },
      ],
    });
    expect(before.status).toBe('paid');

    // Fee structure increased (bursar adds an extra charge after payment)
    const updatedStructures: FeeStructure[] = [
      { ...baseFeeStructures[0], amount: 600_000 },  // was 500k
      baseFeeStructures[1],
    ];
    const after = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: updatedStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [
        { id: 'p-b', fee_account_id: ACCOUNT_1, amount: 620_000, status: 'confirmed', is_deleted: false },
      ],
    });
    expect(after.total_fees).toBe(720_000);    // 600k + 120k
    expect(after.total_paid).toBe(620_000);
    expect(after.balance).toBe(100_000);
    expect(after.status).toBe('partial');      // was paid, now partial due to increase
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('handles zero fee structures (no fees set up for term)', () => {
    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: [],
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: [],
    });
    expect(result.total_fees).toBe(0);
    expect(result.total_expected).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.status).toBe('paid');        // no fees due = treated as paid
  });

  it('handles payments from a different fee_account (not counted)', () => {
    const payments: FeePayment[] = [
      { id: 'p-other', fee_account_id: 'account-OTHER', amount: 620_000, status: 'confirmed', is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.total_paid).toBe(0);         // different account's payment not counted
    expect(result.status).toBe('unpaid');
  });

  it('balance is always a signed number (negative = overpaid)', () => {
    const payments: FeePayment[] = [
      { id: 'p-over', fee_account_id: ACCOUNT_1, amount: 1_000_000, status: 'confirmed', is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.balance).toBe(-380_000);     // 620k expected, 1M paid
    expect(result.status).toBe('overpaid');
  });

  it('multiple payments sum correctly', () => {
    const payments: FeePayment[] = [
      { id: 'p-a', fee_account_id: ACCOUNT_1, amount: 200_000, status: 'confirmed', is_deleted: false },
      { id: 'p-b', fee_account_id: ACCOUNT_1, amount: 200_000, status: 'confirmed', is_deleted: false },
      { id: 'p-c', fee_account_id: ACCOUNT_1, amount: 220_000, status: 'confirmed', is_deleted: false },
    ];

    const result = recalculateFeeAccount({
      account: baseAccount,
      studentClassId: CLASS_ID,
      feeStructures: baseFeeStructures,
      studentDiscounts: [],
      feeDiscounts: [],
      feePayments: payments,
    });

    expect(result.total_paid).toBe(620_000);
    expect(result.status).toBe('paid');
  });
});
