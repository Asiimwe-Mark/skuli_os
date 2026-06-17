"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  motion,
  useInView,
  AnimatePresence,
} from "framer-motion";
import {
  Wallet,
  GraduationCap,
  MessageSquare,
  CalendarCheck,
  Users,
  BarChart3,
  Check,
  Star,
  ChevronDown,
  Menu,
  X,
  Play,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  Shield,
  Wifi,
  CreditCard,
  Smartphone,
  Eye,
  Zap,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { PLAN_CONFIG, type PlanKey } from "@/lib/config/plans";

/* ------------------------------------------------------------------ */
/*  ANIMATED COUNTER                                                   */
/* ------------------------------------------------------------------ */

function useAnimatedCounter(end: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    let startTime: number | null = null;
    let raf: number;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration]);

  return { count, ref };
}

/* ------------------------------------------------------------------ */
/*  SECTION WRAPPER                                                    */
/* ------------------------------------------------------------------ */

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative", className)}
    >
      {children}
    </motion.section>
  );
}

/* ================================================================== */
/*  NAVIGATION                                                         */
/* ================================================================== */

function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features",     href: "#features" },
    { label: "Pricing",      href: "#pricing" },
    { label: "Setup Service",href: "#concierge" },
    { label: "FAQ",          href: "#faq" },
  ];

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-bg border-b border-border shadow-card"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-2 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl opacity-50 blur-md group-hover:opacity-75 transition-opacity" />
              <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-card">
                <span className="font-display font-bold text-white text-base">S</span>
              </div>
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">
              SKULI
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted hover:text-heading transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle className="bg-bg-tertiary border-border" />
            <Link href="/login">
              <Button variant="ghost" size="sm">Login</Button>
            </Link>
            <Link href="/onboard">
              <Button size="sm" variant="default">Start Free Trial</Button>
            </Link>
          </div>

          <button
            className="md:hidden p-2 rounded-xl text-muted hover:text-heading hover:bg-card-hover transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden overflow-hidden"
            >
              <div className="flex flex-col gap-1 py-4 border-t border-border">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 text-sm font-medium text-muted hover:text-heading hover:bg-card-hover rounded-xl transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-3 flex flex-col gap-2 px-3">
                  <Link href="/login"><Button variant="ghost" className="w-full">Login</Button></Link>
                  <Link href="/onboard"><Button variant="default" className="w-full">Start Free Trial</Button></Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
}

/* ================================================================== */
/*  HERO                                                               */
/* ================================================================== */

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-24 pb-12">
      {/* Subtle grid only - no orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-30" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-tertiary border text-primary text-xs font-semibold mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Trusted by 50+ Ugandan Schools
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
            >
              The Operating System for{" "}
              <span className="">Ugandan Schools</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg text-muted leading-relaxed max-w-lg"
            >
              Manage fees, track results, send SMS alerts, and run payroll - all from one
              platform built for Ugandan private schools.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link href="/onboard">
                <Button size="lg" variant="default" className="text-base px-7">
                  Start Free Trial
                  <ArrowRight size={18} />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="text-base px-7" asChild>
                <a href="#features">
                  <Play size={16} />
                  Watch Demo
                </a>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-8 flex items-center gap-6 text-xs text-muted"
            >
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-secondary" />
                30-day free trial
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-secondary" />
                No credit card
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-secondary" />
                Cancel anytime
              </div>
            </motion.div>
          </div>

          {/* Animated illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative hidden lg:block"
          >
            <div className="relative w-full aspect-square max-w-lg mx-auto">
              {/* Glow */}
              <div className="absolute -inset-8 rounded-3xl opacity-15 blur-3xl" />

              {/* Main dashboard mock */}
              <div className="relative rounded-3xl bg-bg-tertiary backdrop-blur-xl border border-border shadow-pop overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center">
                        <span className="text-white font-display font-bold text-xs">S</span>
                      </div>
                      <div className="h-2.5 w-20 rounded-full bg-bg-tertiary" />
                    </div>
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-bg-tertiary" />
                      <div className="h-2 w-2 rounded-full bg-bg-tertiary" />
                      <div className="h-2 w-2 rounded-full bg-bg-tertiary" />
                    </div>
                  </div>

                  <div className="flex items-end gap-2 h-32 pt-4">
                    {[40, 65, 50, 80, 60, 95, 70].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ duration: 0.8, delay: 0.6 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className="flex-1 rounded-t-md"
                      />
                    ))}
                  </div>

                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2 + i * 0.1 }}
                        className="h-10 rounded-lg bg-bg-tertiary border border-border flex items-center px-3 gap-2"
                      >
                        <div className="h-5 w-5 rounded opacity-60" />
                        <div className="h-1.5 flex-1 rounded-full bg-bg-tertiary" />
                        <div className="h-5 w-12 rounded bg-bg-tertiary" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating cards */}
              <motion.div
                initial={{ opacity: 0, x: 30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -top-4 -right-4 rounded-2xl p-3 shadow-pop"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center">
                    <Wallet size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Fees Collected</p>
                    <p className="text-sm font-bold text-success-600 dark:text-success-400">UGX 2.1M</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 1.3, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -bottom-4 -left-4 rounded-2xl p-3 shadow-pop"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center">
                    <GraduationCap size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted">Students</p>
                    <p className="text-sm font-bold">1,247</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, delay: 1.5, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-1/2 -right-8 rounded-2xl p-3 shadow-pop"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-info-50 text-secondary flex items-center justify-center">
                    <MessageSquare size={12} />
                  </div>
                  <span className="text-xs font-semibold">SMS Sent: 847</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto lg:mx-0"
        >
          <StatCounter label="Schools" value={50} suffix="+" />
          <StatCounter label="Fees Processed" prefix="UGX " value={2} suffix="B+" />
          <StatCounter label="SMS Sent" value={100} suffix="K+" />
        </motion.div>
      </div>
    </section>
  );
}

function StatCounter({
  label,
  value,
  prefix = "",
  suffix = "",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const { count, ref } = useAnimatedCounter(value, 2000);
  return (
    <div ref={ref} className="relative overflow-hidden rounded-2xl border border-border bg-bg-tertiary backdrop-blur-xl p-5 shadow-card">
      <div className="absolute -top-8 -right-8 h-20 w-20 rounded-full opacity-15 blur-2xl" />
      <p className="text-3xl sm:text-4xl font-bold tabular-nums">
        {prefix}
        {count}
        {suffix}
      </p>
      <p className="text-sm text-muted mt-1 font-medium">{label}</p>
    </div>
  );
}

/* ================================================================== */
/*  FEATURES                                                           */
/* ================================================================== */

const featuresData = [
  { icon: Wallet,        title: "Fee Management",      description: "Track fees, send reminders, collect via Mobile Money, and generate receipts automatically.", color: "text-success-600 dark:text-success-400",   bg: " ",   ring: "ring-success-50" },
  { icon: GraduationCap, title: "Results & Reports",   description: "Enter marks, compute aggregates, and generate beautiful report cards aligned to the Ugandan curriculum.", color: "text-muted", bg: " ",   ring: "ring-border" },
  { icon: MessageSquare, title: "SMS Communication",   description: "Send bulk SMS to parents for fee reminders, announcements, and exam results instantly.",         color: "text-info-600 dark:text-info-400",   bg: " ",     ring: "ring-info-50" },
  { icon: CalendarCheck, title: "Attendance Tracking", description: "Record daily attendance per class, track patterns, and alert parents of absences.",            color: "text-muted",bg: " ", ring: "ring-border" },
  { icon: Users,         title: "Staff & Payroll",     description: "Manage staff records, compute payroll with NSSF deductions, and generate payslips.",            color: "text-danger-600 dark:text-danger-400", bg: " ",   ring: "ring-danger-50" },
  { icon: BarChart3,     title: "Analytics & Reports", description: "Get real-time dashboards for fees, performance, attendance, and financial health.",            color: "text-warning-600 dark:text-warning-400",     bg: " ",       ring: "ring-warning-50" },
];

function Features() {
  return (
    <Section id="features" className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="h-3 w-3" />
            Features
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Everything Your School{" "}
            <span className="">Needs</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted text-lg leading-relaxed"
          >
            A complete toolkit designed specifically for the way Ugandan schools operate.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {featuresData.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-card hover:shadow-pop transition-all"
            >
              <div className="pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-0 group-hover:opacity-15 blur-3xl transition-opacity duration-500" />
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg} ring-1 ${feature.ring} transition-transform group-hover:scale-110 group-hover:rotate-3`}>
                <feature.icon size={24} className={feature.color} />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  HOW IT WORKS                                                       */
/* ================================================================== */

const stepsData = [
  { number: "01", title: "Sign Up in 2 Minutes",    description: "Create your school account with just a name and phone number. No paperwork needed." },
  { number: "02", title: "Set Up Your School",      description: "Add classes, students, fee structure, and staff. Our wizard makes it effortless." },
  { number: "03", title: "Start Managing",          description: "Collect fees via Mobile Money, enter marks, send SMS, and run payroll from day one." },
];

function HowItWorks() {
  return (
    <Section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="h-3 w-3" />
            How It Works
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Up and Running in <span className="">3 Simple Steps</span>
          </motion.h2>
        </div>

        <div className="relative max-w-3xl mx-auto">
          <div className="hidden sm:block absolute left-8 top-0 bottom-0 w-px" aria-hidden="true" />

          <div className="space-y-12 sm:space-y-16">
            {stepsData.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex gap-6 sm:gap-8"
              >
                <div className="relative z-10 flex-shrink-0">
                  <div className="absolute -inset-2 rounded-2xl opacity-30 blur-xl" />
                  <div className="relative h-16 w-16 rounded-2xl flex items-center justify-center shadow-pop">
                    <span className="text-white font-display text-xl font-bold">
                      {step.number}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
                  <p className="text-muted leading-relaxed max-w-md">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  PRICING                                                            */
/* ================================================================== */

function Pricing() {
  return (
    <Section id="pricing" className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="h-3 w-3" />
            Pricing
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Simple, <span className="">Transparent</span> Pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted text-lg"
          >
            All plans include a 30-day free trial. No credit card required.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-7 max-w-5xl mx-auto">
          {(Object.keys(PLAN_CONFIG) as PlanKey[])
            .filter((k) => k !== "trial")
            .map((key, idx) => {
              const plan = PLAN_CONFIG[key];
              const popular = plan.highlight;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ y: -6, transition: { duration: 0.25 } }}
                  className={cn(
                    "relative rounded-2xl p-7 flex flex-col transition-all",
                    popular
                      ? "    border-2 border-primary shadow-pop"
                      : "bg-card border border-border shadow-card hover:shadow-pop"
                  )}
                >
                  {popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-[10px] font-bold uppercase tracking-wider shadow-card">
                        <Sparkles className="h-2.5 w-2.5" />
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="mb-5">
                    <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                    <p className="text-sm text-muted mt-1">
                      {plan.max_students >= 99_999 ? "Unlimited students" : `Up to ${plan.max_students.toLocaleString()} students`}
                    </p>
                  </div>

                  <div className="mb-5">
                    <span className="text-sm text-muted">UGX </span>
                    <span className="font-display text-4xl font-bold tabular-nums">
                      {plan.price_ugx.toLocaleString()}
                    </span>
                    <span className="text-muted text-sm">/mo</span>
                  </div>

                  <ul className="space-y-2.5 mb-7 flex-1">
                    {plan.features.slice(0, 6).map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <span className="h-5 w-5 rounded-full bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                        <span className="text-heading-500">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/onboard">
                    <Button
                      variant={popular ? "default" : "outline"}
                      className="w-full"
                      size="lg"
                    >
                      Start Free Trial
                    </Button>
                  </Link>
                </motion.div>
              );
            })}
        </div>

        <PricingComparison />
      </div>
    </Section>
  );
}

function PricingComparison() {
  const planKeys: PlanKey[] = ["starter", "growth", "pro"];
  const allFeatures: string[] = [];
  for (const key of planKeys) {
    for (const f of PLAN_CONFIG[key].features) {
      if (!allFeatures.includes(f)) allFeatures.push(f);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mt-14 max-w-5xl mx-auto overflow-x-auto rounded-2xl border border-border bg-card shadow-card"
    >
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-bg-tertiary">
            <th className="text-left py-4 px-5 font-semibold">Feature</th>
            {planKeys.map((key) => (
              <th key={key} className="text-center py-4 px-4 font-semibold">
                {PLAN_CONFIG[key].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allFeatures.map((feature, i) => (
            <tr key={feature} className={cn("border-b border-border/50 last:border-0", i % 2 === 0 && "bg-bg-tertiary")}>
              <td className="py-3 px-5 text-muted">{feature}</td>
              {planKeys.map((key) => {
                const has = (PLAN_CONFIG[key].features as readonly string[]).includes(feature);
                return (
                  <td key={key} className="text-center py-3 px-4">
                    {has ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="text-muted" aria-label="Not included">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}

/* ================================================================== */
/*  CONCIERGE                                                          */
/* ================================================================== */

function Concierge() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    school_name: "", contact_name: "", contact_phone: "", contact_email: "",
    district: "", student_count: "", current_system: "", notes: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/concierge/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_name: form.school_name,
          contact_name: form.contact_name,
          contact_phone: form.contact_phone,
          contact_email: form.contact_email,
          district: form.district || undefined,
          student_count: form.student_count ? Number(form.student_count) : undefined,
          current_system: form.current_system || undefined,
          notes: form.notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not submit request");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setSubmitting(false);
    }
  }

  const included = [
    "Complete data migration from Excel or SchoolPower",
    "Hands-on staff training session",
    "30-day priority support",
  ];

  return (
    <Section id="concierge" className="py-24 lg:py-32">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden border border-border bg-bg-tertiary p-8 sm:p-12 text-center shadow-card"
        >
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest">
              <Sparkles className="h-3 w-3" />
              Setup Service
            </span>
            <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Need help moving from <span className="">Excel or SchoolPower?</span>
            </h2>
            <p className="mt-4 text-muted text-lg max-w-2xl mx-auto">
              Our team will migrate your data, train your staff, and have you fully operational in 48 hours.
            </p>

            <ul className="mt-8 grid sm:grid-cols-3 gap-3 text-left max-w-3xl mx-auto">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-2.5 p-3 rounded-xl bg-bg-tertiary border border-border text-sm">
                  <span className="h-5 w-5 rounded-full bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className="text-heading-500">{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-8 font-display text-2xl font-bold">
              From <span className="">UGX 200,000</span>
              <span className="text-base text-muted font-normal"> - one-time setup fee</span>
            </p>

            <div className="mt-6">
              <Button size="lg" variant="default" onClick={() => setOpen(true)} className="text-base px-8">
                Book a Setup Session
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSubmitted(false); setError(null); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{submitted ? "Request received" : "Book a Setup Session"}</DialogTitle>
          </DialogHeader>
          {submitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full opacity-30 blur-xl" />
                <div className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-card">
                  <Check className="text-white" size={28} strokeWidth={3} />
                </div>
              </div>
              <p className="text-sm text-muted">We'll contact you within 24 hours.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input placeholder="School name *" required value={form.school_name} onChange={(e) => update("school_name", e.target.value)} />
              <Input placeholder="Your name *" required value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Phone *" required value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} />
                <Input type="email" placeholder="Email *" required value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="District" value={form.district} onChange={(e) => update("district", e.target.value)} />
                <Input type="number" placeholder="Number of students" value={form.student_count} onChange={(e) => update("student_count", e.target.value)} />
              </div>
              <select
                className="w-full h-11 px-3.5 rounded-xl border bg-card text-heading text-sm border-border hover:border-border-strong focus:outline-none focus: focus:ring-2 focus:ring-border transition-all"
                value={form.current_system}
                onChange={(e) => update("current_system", e.target.value)}
              >
                <option value="">Current system (optional)</option>
                <option value="excel">Excel</option>
                <option value="schoolpower">SchoolPower</option>
                <option value="paper">Paper</option>
                <option value="other">Other</option>
              </select>
              <textarea
                className="flex min-h-[80px] w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm border-border hover:border-border-strong focus:outline-none focus: focus:ring-2 focus:ring-border placeholder:text-muted transition-all resize-y"
                rows={3}
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
              {error && <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>}
              <Button type="submit" variant="default" className="w-full" size="lg" loading={submitting}>
                {!submitting && "Submit request"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Section>
  );
}

/* ================================================================== */
/*  TESTIMONIALS                                                       */
/* ================================================================== */

const testimonialsData = [
  {
    quote: "SKULI transformed how we manage fees. Parents pay via Mobile Money and we track everything in real time. No more paper ledgers!",
    name: "Sarah Nakamya", role: "Headmistress", school: "Bright Future Primary School, Kampala",
    initials: "SN", color: " ",
  },
  {
    quote: "The report card module saves us weeks each term. Marks entry, aggregate calculation, and printing - all done in one place.",
    name: "David Ochieng", role: "Director of Studies", school: "St. Joseph's Secondary, Mukono",
    initials: "DO", color: " ",
  },
  {
    quote: "We send SMS to over 800 parents in minutes. Fee reminders, event alerts, and exam results - parents love the communication.",
    name: "Grace Auma", role: "School Administrator", school: "Victory Academy, Jinja",
    initials: "GA", color: " ",
  },
];

function Testimonials() {
  return (
    <Section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="h-3 w-3" />
            Testimonials
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Loved by <span className="">Schools</span> Across Uganda
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
          {testimonialsData.map((t, idx) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.25 } }}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 flex flex-col shadow-card hover:shadow-pop transition-all"
            >
              <div className={`pointer-events-none absolute -top-16 -right-16 h-32 w-32 rounded-full  ${t.color} opacity-10 blur-2xl`} />
              <div className="flex gap-0.5 mb-4" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={16} className="fill-warning-400 text-secondary" />
                ))}
              </div>

              <blockquote className="text-sm text-heading-500 leading-relaxed flex-1 mb-5">
                "{t.quote}"
              </blockquote>

              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className={`h-10 w-10 rounded-full ${t.color} flex items-center justify-center text-sm font-bold text-white shadow-card`} aria-hidden="true">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted">{t.role}, {t.school}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  FAQ                                                                */
/* ================================================================== */

const faqData = [
  { question: "Is my school data safe?",         answer: "Absolutely. We use bank-grade encryption (AES-256) for all data at rest and TLS 1.3 for data in transit. Your database is hosted on Supabase with daily backups, and we comply with Uganda's Data Protection Act. Only authorized users in your school can access your data.", icon: Shield },
  { question: "Do I need internet to use SKULI?", answer: "SKULI is a cloud-based platform, so you need an internet connection for most features. However, we're building offline support for core features like attendance and marks entry that will sync when you're back online.", icon: Wifi },
  { question: "How much does it cost?",          answer: "Plans start at UGX 150,000/month for up to 200 students. All plans come with a 30-day free trial - no credit card required. You can upgrade, downgrade, or cancel anytime.", icon: CreditCard },
  { question: "Can parents see their child's results?", answer: "Yes! We're building a parent portal where parents can view report cards, fee statements, attendance records, and receive SMS notifications - all from their phone.", icon: Eye },
  { question: "How does Mobile Money collection work?", answer: "SKULI integrates with MTN Mobile Money and Airtel Money. When a parent pays, the transaction is automatically recorded and matched to the student's fee account. You can track all collections in real time from your dashboard.", icon: Smartphone },
  { question: "Can I try before I pay?",         answer: "Of course! Every plan includes a full-featured 30-day free trial. No credit card needed to sign up. If you love it, you can continue with a paid plan. If not, no questions asked.", icon: Zap },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <Section id="faq" className="py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-widest"
          >
            <Sparkles className="h-3 w-3" />
            FAQ
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Frequently Asked <span className="">Questions</span>
          </motion.h2>
        </div>

        <div className="space-y-3" role="list">
          {faqData.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "rounded-2xl border bg-card overflow-hidden transition-all",
                  isOpen ? " shadow-card" : "border-border"
                )}
                role="listitem"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex items-center gap-4 w-full p-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    isOpen ? " text-white" : "bg-bg-tertiary text-primary ring-1 "
                  )}>
                    <faq.icon size={16} />
                  </div>
                  <span className="flex-1 text-sm font-semibold pr-4 text-heading">{faq.question}</span>
                  <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown size={18} className="text-muted" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pl-[4.25rem] text-sm text-muted leading-relaxed">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  CTA SECTION                                                        */
/* ================================================================== */

function CTA() {
  return (
    <Section className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden border border-border shadow-pop"
        >
          <div className="absolute inset-0" />
          <div className="absolute inset-0 opacity-20" />
          <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-bg-tertiary blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-bg-tertiary blur-3xl" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center text-white">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
            >
              Ready to Transform Your School?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mt-4 text-lg text-white/85 max-w-lg mx-auto"
            >
              Start your 30-day free trial today. No credit card required.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mt-8"
            >
              <Link href="/onboard">
                <Button size="lg" className="text-base px-10 bg-card text-primary hover:bg-card-hover hover:scale-105 shadow-pop">
                  Start Free Trial
                  <ArrowRight size={18} />
                </Button>
              </Link>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="mt-4 text-xs text-white/70"
            >
              No credit card required * Cancel anytime
            </motion.p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  FOOTER                                                             */
/* ================================================================== */

function Footer() {
  const linkColumns = [
    { title: "Product", links: [
      { label: "Features",      href: "#features" },
      { label: "Pricing",       href: "#pricing" },
      { label: "Setup Service", href: "#concierge" },
      { label: "FAQ",           href: "#faq" },
    ]},
    { title: "Company", links: [
      { label: "About",   href: "#" },
      { label: "Contact", href: "#" },
      { label: "Careers", href: "#" },
    ]},
    { title: "Legal", links: [
      { label: "Privacy", href: "#" },
      { label: "Terms",   href: "#" },
    ]},
  ];

  return (
    <footer className="relative border-t border-border bg-bg-tertiary">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          <div className="col-span-2">
            <a href="#" className="inline-flex items-center gap-2">
              <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-card">
                <span className="font-display font-bold text-white text-base">S</span>
                <div className="absolute -inset-0.5 rounded-xl opacity-30 blur-md -z-10" />
              </div>
              <span className="font-display text-2xl font-bold">SKULI</span>
            </a>
            <p className="mt-3 text-sm text-muted leading-relaxed max-w-xs">
              The operating system for Ugandan schools. Manage fees, results, attendance, and payroll from one platform.
            </p>

            <div className="mt-6 space-y-2.5">
              <a href="mailto:hello@skuli.app" className="flex items-center gap-2.5 text-sm text-muted hover:text-heading transition-colors group">
                <span className="h-7 w-7 rounded-md bg-bg-tertiary text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Mail size={12} />
                </span>
                hello@skuli.app
              </a>
              <a href="tel:+256700123456" className="flex items-center gap-2.5 text-sm text-muted hover:text-heading transition-colors group">
                <span className="h-7 w-7 rounded-md bg-bg-tertiary text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Phone size={12} />
                </span>
                +256 700 123 456
              </a>
              <p className="flex items-center gap-2.5 text-sm text-muted">
                <span className="h-7 w-7 rounded-md bg-bg-tertiary text-primary flex items-center justify-center">
                  <MapPin size={12} />
                </span>
                Kampala, Uganda
              </p>
            </div>
          </div>

          {linkColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-muted hover:text-secondary transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted">
            (C) {new Date().getFullYear()} SKULI. All rights reserved.
          </p>
          <p className="text-xs text-muted flex items-center gap-1.5">
            Made with
            <span className="text-secondary" aria-label="love">&#10084;&#65039;</span>
            in Uganda
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */

export default function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <Navigation />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Concierge />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
