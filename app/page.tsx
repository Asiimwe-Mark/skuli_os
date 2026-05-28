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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

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
      setCount(Math.floor(progress * end));
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
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
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
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-navy/90 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/20"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-1">
            <span className="font-display text-2xl font-bold text-amber tracking-tight">
              SKULI
            </span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Login
              </Button>
            </Link>
            <Link href="/onboard">
              <Button size="sm">Start Free Trial</Button>
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden overflow-hidden border-t border-white/5"
            >
              <div className="flex flex-col gap-1 py-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-lg transition-colors"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="mt-3 flex flex-col gap-2 px-3">
                  <Link href="/login">
                    <Button variant="ghost" className="w-full">
                      Login
                    </Button>
                  </Link>
                  <Link href="/onboard">
                    <Button className="w-full">Start Free Trial</Button>
                  </Link>
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
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-amber/5 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] rounded-full bg-emerald/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Text column */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber/10 border border-amber/20 text-amber text-xs font-medium mb-6">
                <Zap size={12} />
                Trusted by 50+ Ugandan Schools
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight"
            >
              The Operating System for{" "}
              <span className="gradient-text">Ugandan Schools</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg"
            >
              Manage fees, track results, send SMS alerts, and run payroll
              &mdash; all from one platform built for Ugandan private schools.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <Link href="/onboard">
                <Button size="lg" className="text-base px-8">
                  Start Free Trial
                  <ArrowRight size={18} />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="text-base px-8" asChild>
                <a href="#features">
                  <Play size={18} />
                  Watch Demo
                </a>
              </Button>
            </motion.div>
          </div>

          {/* Animated illustration placeholder */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            <div className="relative w-full aspect-square max-w-lg mx-auto">
              {/* Main dashboard mock */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-surface via-navy-100 to-surface border border-white/10 shadow-2xl shadow-black/40 overflow-hidden">
                <div className="p-6 space-y-4">
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-24 rounded-full bg-white/10" />
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-rose/60" />
                      <div className="h-2 w-2 rounded-full bg-amber/60" />
                      <div className="h-2 w-2 rounded-full bg-emerald/60" />
                    </div>
                  </div>
                  {/* Animated chart bars */}
                  <div className="flex items-end gap-2 h-32 pt-4">
                    {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{
                          duration: 0.8,
                          delay: 0.6 + i * 0.08,
                        }}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-amber-500/40 to-amber-500/80"
                      />
                    ))}
                  </div>
                  {/* Fake table rows */}
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-8 rounded-lg bg-white/5 border border-white/5"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating card: Fees Collected */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1 }}
                className="absolute -top-4 -right-4 glass-card p-3 shadow-xl"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-emerald/20 flex items-center justify-center">
                    <Wallet size={16} className="text-emerald" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Fees Collected
                    </p>
                    <p className="text-sm font-bold text-emerald">UGX 2.1M</p>
                  </div>
                </div>
              </motion.div>

              {/* Floating card: Students */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 1.2 }}
                className="absolute -bottom-4 -left-4 glass-card p-3 shadow-xl"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber/20 flex items-center justify-center">
                    <GraduationCap size={16} className="text-amber" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Students
                    </p>
                    <p className="text-sm font-bold text-amber">1,247</p>
                  </div>
                </div>
              </motion.div>

              {/* Floating card: SMS Sent */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 }}
                className="absolute top-1/2 -right-8 glass-card p-3 shadow-xl"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-sky-400" />
                  <span className="text-xs font-medium">SMS Sent: 847</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Bottom stat counters */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto lg:mx-0"
        >
          <StatCounter label="Schools" value={50} suffix="+" />
          <StatCounter
            label="Fees Processed"
            prefix="UGX "
            value={2}
            suffix="B+"
          />
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
    <div ref={ref} className="text-center lg:text-left">
      <p className="text-2xl sm:text-3xl font-bold text-foreground">
        {prefix}
        {count}
        {suffix}
      </p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

/* ================================================================== */
/*  FEATURES                                                           */
/* ================================================================== */

const featuresData = [
  {
    icon: Wallet,
    title: "Fee Management",
    description:
      "Track fees, send reminders, collect via Mobile Money, and generate receipts automatically.",
    color: "text-emerald",
    bg: "bg-emerald/10",
  },
  {
    icon: GraduationCap,
    title: "Results & Report Cards",
    description:
      "Enter marks, compute aggregates, and generate beautiful report cards aligned to the Ugandan curriculum.",
    color: "text-amber",
    bg: "bg-amber/10",
  },
  {
    icon: MessageSquare,
    title: "SMS Communication",
    description:
      "Send bulk SMS to parents for fee reminders, announcements, and exam results instantly.",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
  {
    icon: CalendarCheck,
    title: "Attendance Tracking",
    description:
      "Record daily attendance per class, track patterns, and alert parents of absences.",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    icon: Users,
    title: "Staff & Payroll",
    description:
      "Manage staff records, compute payroll with NSSF deductions, and generate payslips.",
    color: "text-rose",
    bg: "bg-rose/10",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description:
      "Get real-time dashboards for fees, performance, attendance, and financial health.",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
  },
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
            className="text-amber text-sm font-semibold uppercase tracking-widest"
          >
            Features
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-3xl sm:text-4xl font-bold"
          >
            Everything Your School Needs
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted-foreground text-lg"
          >
            A complete toolkit designed specifically for the way Ugandan schools
            operate.
          </motion.p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuresData.map((feature, idx) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.08 }}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="group glass-card p-6 hover:border-amber/20 transition-colors"
            >
              <div
                className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center mb-4",
                  feature.bg
                )}
              >
                <feature.icon size={24} className={feature.color} />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
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
  {
    number: "01",
    title: "Sign Up in 2 Minutes",
    description:
      "Create your school account with just a name and phone number. No paperwork needed.",
  },
  {
    number: "02",
    title: "Set Up Your School",
    description:
      "Add classes, students, fee structure, and staff. Our wizard makes it effortless.",
  },
  {
    number: "03",
    title: "Start Managing",
    description:
      "Collect fees via Mobile Money, enter marks, send SMS, and run payroll from day one.",
  },
];

function HowItWorks() {
  return (
    <Section className="py-24 lg:py-32 bg-navy-100/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-amber text-sm font-semibold uppercase tracking-widest"
          >
            How It Works
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-3xl sm:text-4xl font-bold"
          >
            Up and Running in 3 Simple Steps
          </motion.h2>
        </div>

        <div className="relative max-w-3xl mx-auto">
          {/* Connecting vertical line (desktop only) */}
          <div
            className="hidden sm:block absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-amber-500/40 via-amber-500/20 to-transparent"
            aria-hidden="true"
          />

          <div className="space-y-12 sm:space-y-16">
            {stepsData.map((step, idx) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.15 }}
                className="relative flex gap-6 sm:gap-8"
              >
                {/* Numbered circle */}
                <div className="relative z-10 flex-shrink-0">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg glow-amber">
                    <span className="text-navy font-display text-xl font-bold">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="pt-2">
                  <h3 className="font-display text-xl font-semibold mb-2">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-md">
                    {step.description}
                  </p>
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

const plansData = [
  {
    name: "Starter",
    price: "150,000",
    period: "/mo",
    description: "Perfect for small schools just getting started.",
    features: [
      "Up to 200 students",
      "1 user account",
      "Fee management",
      "Basic SMS",
      "Email support",
    ],
    popular: false,
  },
  {
    name: "Growth",
    price: "350,000",
    period: "/mo",
    description: "For growing schools that need the full toolkit.",
    features: [
      "Up to 500 students",
      "5 user accounts",
      "All modules included",
      "Report cards",
      "Staff & Payroll",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Pro",
    price: "750,000",
    period: "/mo",
    description: "Unlimited power for large institutions.",
    features: [
      "Unlimited students",
      "Unlimited user accounts",
      "All features included",
      "Priority support",
      "Custom branding",
      "Dedicated account manager",
    ],
    popular: false,
  },
];

function Pricing() {
  return (
    <Section id="pricing" className="py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-amber text-sm font-semibold uppercase tracking-widest"
          >
            Pricing
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-3xl sm:text-4xl font-bold"
          >
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-muted-foreground text-lg"
          >
            All plans include a 30-day free trial. No credit card required.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plansData.map((plan, idx) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className={cn(
                "relative glass-card p-8 flex flex-col",
                plan.popular &&
                  "border-amber/40 shadow-amber/10 shadow-xl glow-amber"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber text-navy text-xs font-bold uppercase tracking-wide">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="font-display text-xl font-semibold">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-sm text-muted-foreground">UGX </span>
                <span className="font-display text-4xl font-bold">
                  {plan.price}
                </span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      size={16}
                      className="text-emerald mt-0.5 flex-shrink-0"
                    />
                    <span className="text-sm text-muted-foreground">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link href="/onboard">
                <Button
                  variant={plan.popular ? "default" : "outline"}
                  className="w-full"
                >
                  Start Free Trial
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ================================================================== */
/*  TESTIMONIALS                                                       */
/* ================================================================== */

const testimonialsData = [
  {
    quote:
      "SKULI transformed how we manage fees. Parents pay via Mobile Money and we track everything in real time. No more paper ledgers!",
    name: "Sarah Nakamya",
    role: "Headmistress",
    school: "Bright Future Primary School, Kampala",
    initials: "SN",
    color: "bg-amber/20 text-amber",
  },
  {
    quote:
      "The report card module saves us weeks each term. Marks entry, aggregate calculation, and printing \u2014 all done in one place.",
    name: "David Ochieng",
    role: "Director of Studies",
    school: "St. Joseph\u2019s Secondary, Mukono",
    initials: "DO",
    color: "bg-emerald/20 text-emerald",
  },
  {
    quote:
      "We send SMS to over 800 parents in minutes. Fee reminders, event alerts, and exam results \u2014 parents love the communication.",
    name: "Grace Auma",
    role: "School Administrator",
    school: "Victory Academy, Jinja",
    initials: "GA",
    color: "bg-sky-400/20 text-sky-400",
  },
];

function Testimonials() {
  return (
    <Section className="py-24 lg:py-32 bg-navy-100/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-amber text-sm font-semibold uppercase tracking-widest"
          >
            Testimonials
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-3xl sm:text-4xl font-bold"
          >
            Loved by Schools Across Uganda
          </motion.h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {testimonialsData.map((t, idx) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="glass-card p-6 flex flex-col"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className="fill-amber text-amber"
                  />
                ))}
              </div>

              {/* Quote */}
              <blockquote className="text-sm text-muted-foreground leading-relaxed flex-1 mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold",
                    t.color
                  )}
                  aria-hidden="true"
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.role}, {t.school}
                  </p>
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
  {
    question: "Is my school data safe?",
    answer:
      "Absolutely. We use bank-grade encryption (AES-256) for all data at rest and TLS 1.3 for data in transit. Your database is hosted on Supabase with daily backups, and we comply with Uganda\u2019s Data Protection Act. Only authorized users in your school can access your data.",
    icon: Shield,
  },
  {
    question: "Do I need internet to use SKULI?",
    answer:
      "SKULI is a cloud-based platform, so you need an internet connection for most features. However, we\u2019re building offline support for core features like attendance and marks entry that will sync when you\u2019re back online.",
    icon: Wifi,
  },
  {
    question: "How much does it cost?",
    answer:
      "Plans start at UGX 150,000/month for up to 200 students. All plans come with a 30-day free trial \u2014 no credit card required. You can upgrade, downgrade, or cancel anytime.",
    icon: CreditCard,
  },
  {
    question: "Can parents see their child\u2019s results?",
    answer:
      "Yes! We\u2019re building a parent portal where parents can view report cards, fee statements, attendance records, and receive SMS notifications \u2014 all from their phone.",
    icon: Eye,
  },
  {
    question: "How does Mobile Money collection work?",
    answer:
      "SKULI integrates with MTN Mobile Money and Airtel Money. When a parent pays, the transaction is automatically recorded and matched to the student\u2019s fee account. You can track all collections in real time from your dashboard.",
    icon: Smartphone,
  },
  {
    question: "Can I try before I pay?",
    answer:
      "Of course! Every plan includes a full-featured 30-day free trial. No credit card needed to sign up. If you love it, you can continue with a paid plan. If not, no questions asked.",
    icon: Zap,
  },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Section id="faq" className="py-24 lg:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-amber text-sm font-semibold uppercase tracking-widest"
          >
            FAQ
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 font-display text-3xl sm:text-4xl font-bold"
          >
            Frequently Asked Questions
          </motion.h2>
        </div>

        <div className="space-y-3" role="list">
          {faqData.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.06 }}
                className="glass-card overflow-hidden"
                role="listitem"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex items-center gap-4 w-full p-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="h-8 w-8 rounded-lg bg-amber/10 flex items-center justify-center flex-shrink-0">
                    <faq.icon size={16} className="text-amber" />
                  </div>
                  <span className="flex-1 text-sm font-semibold pr-4">
                    {faq.question}
                  </span>
                  <ChevronDown
                    size={18}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200 flex-shrink-0",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pl-[4.25rem] text-sm text-muted-foreground leading-relaxed">
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
          className="relative rounded-3xl overflow-hidden"
        >
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent" />
          <div className="absolute inset-0 glass" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold"
            >
              Ready to Transform Your School?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mt-4 text-lg text-muted-foreground max-w-lg mx-auto"
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
                <Button size="lg" className="text-base px-10">
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
              className="mt-4 text-xs text-muted-foreground"
            >
              No credit card required &middot; Cancel anytime
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
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#" },
        { label: "Contact", href: "#" },
        { label: "Careers", href: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
      ],
    },
  ];

  return (
    <footer className="border-t border-white/5 bg-navy-100/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="col-span-2">
            <a href="#" className="inline-block">
              <span className="font-display text-2xl font-bold text-amber">
                SKULI
              </span>
            </a>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xs">
              The operating system for Ugandan schools. Manage fees, results,
              attendance, and payroll from one platform.
            </p>

            {/* Contact info */}
            <div className="mt-6 space-y-2.5">
              <a
                href="mailto:hello@skuli.app"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail size={14} />
                hello@skuli.app
              </a>
              <a
                href="tel:+256700123456"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone size={14} />
                +256 700 123 456
              </a>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin size={14} />
                Kampala, Uganda
              </p>
            </div>

            {/* Social icons */}
            <div className="mt-6 flex gap-3">
              {["X", "Li", "Fb"].map((social) => (
                <a
                  key={social}
                  href="#"
                  aria-label={social}
                  className="h-8 w-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-xs font-bold text-muted-foreground hover:text-foreground hover:border-amber/30 transition-colors"
                >
                  {social}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {linkColumns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} SKULI. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Made with{" "}
            <span className="text-rose" aria-label="love">
              &#10084;&#65039;
            </span>{" "}
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
    <>
      <Navigation />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
