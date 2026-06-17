"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Building2,
  Upload,
  UserPlus,
  CreditCard,
  Check,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ImageIcon,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import { UGANDA_DISTRICTS } from "@/lib/utils/uganda-districts";
import { toastError, toastSuccess } from "@/components/ui/use-toast";

type Plan = {
  id: string;
  name: string;
  price: string;
  priceNum: number;
  features: string[];
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "150,000",
    priceNum: 150000,
    features: [
      "Up to 200 students",
      "1 user account",
      "Fee management",
      "Basic SMS",
      "Attendance tracking",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "350,000",
    priceNum: 350000,
    features: [
      "Up to 500 students",
      "5 user accounts",
      "All modules",
      "Report cards & PDF",
      "Staff & payroll",
      "Priority support",
    ],
    popular: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "750,000",
    priceNum: 750000,
    features: [
      "Unlimited students",
      "Unlimited users",
      "All features",
      "Custom branding",
      "API access",
      "Dedicated support",
    ],
  },
];

const STEPS = [
  { title: "School Details", icon: Building2 },
  { title: "School Logo",    icon: Upload },
  { title: "Admin Account",  icon: UserPlus },
  { title: "Choose Plan",    icon: CreditCard },
];

const selectClass =
  "w-full h-11 px-3.5 rounded-xl border bg-card text-heading text-sm " +
  "border-border hover:border-border-strong " +
  "focus:outline-none focus: focus:ring-2 focus:ring-border " +
  "transition-all duration-200";

export default function OnboardPage() {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [schoolName, setSchoolName] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [schoolType, setSchoolType] = useState<"primary" | "secondary" | "nursery" | "both">("both");
  const [motto, setMotto] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState("growth");

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        if (!schoolName.trim()) {
          toastError({ title: "School name is required" });
          return false;
        }
        if (!district) {
          toastError({ title: "Please select a district" });
          return false;
        }
        if (!phone.trim()) {
          toastError({ title: "Phone number is required" });
          return false;
        }
        return true;
      case 1: return true;
      case 2:
        if (!fullName.trim()) {
          toastError({ title: "Full name is required" });
          return false;
        }
        if (!adminEmail.trim()) {
          toastError({ title: "Email is required" });
          return false;
        }
        if (password.length < 8) {
          toastError({ title: "Password too short", description: "Use at least 8 characters." });
          return false;
        }
        if (password !== confirmPassword) {
          toastError({ title: "Passwords do not match" });
          return false;
        }
        return true;
      case 3: return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // ── Step 1: Create the school first to get the school_id ────────────
      // We need the school_id to build a proper storage path. The logo
      // upload happens AFTER the API call returns the new school_id.
      const response = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: {
            name: schoolName,
            address: address || undefined,
            district: district || undefined,
            phone: phone || undefined,
            email: email || undefined,
            school_type: schoolType,
            motto: motto || undefined,
            logo_url: null, // uploaded in step 2 below
          },
          admin: { full_name: fullName, email: adminEmail, password },
          plan: selectedPlan,
          start_trial: true,
        }),
      });

      const raw = await response.text();
      let result: { success?: boolean; error?: string; data?: { school_id?: string; user_id?: string } } = {};
      try {
        result = raw ? JSON.parse(raw) : {};
      } catch {
        if (response.status === 429) {
          toastError({
            title: "Too many attempts",
            description: "Please wait a few minutes before trying again.",
          });
          return;
        }
        throw new Error(
          response.redirected
            ? `Server redirected to ${response.url}. Please try again.`
            : `Server returned a non-JSON response (${response.status}). Please try again.`
        );
      }

      if (!response.ok || !result.success) {
        if (response.status === 429) {
          toastError({
            title: "Too many attempts",
            description: "Please wait a few minutes before trying again.",
          });
          return;
        }
        throw new Error(result.error || `Request failed with status ${response.status}`);
      }

      const schoolId = result.data?.school_id;

      // ── Step 2: Upload logo to school-scoped path ────────────────────────
      // MIN-2 fix: logo goes to school-logos/{school_id}/{timestamp}.{ext}
      // so it can be found, managed, and replaced per school. The temp-*
      // path was impossible to clean up or find back.
      if (logoFile && schoolId) {
        const fileExt = logoFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const filePath = `school-logos/${schoolId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("school-assets")
          .upload(filePath, logoFile, {
            cacheControl: "3600",
            upsert: true, // allow re-upload if onboarding is retried
          });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("school-assets")
            .getPublicUrl(filePath);

          // Patch the logo_url back onto the school row
          await fetch(`/api/settings/school`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logo_url: urlData.publicUrl }),
          }).catch(() => {
            // Non-fatal: school was created, logo update failed.
            // User can re-upload in settings.
            console.warn("[onboard] logo URL patch failed — user can update in settings");
          });
        }
      }

      // ── Step 3: Sign in and redirect ────────────────────────────────────
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      });

      if (signInError) {
        toastSuccess({
          title: "School created",
          description: "Sign in to continue.",
        });
        router.push("/login");
        return;
      }

      toastSuccess({
        title: "Welcome to Skuli",
        description: "Your 30-day free trial has started.",
      });
      router.push("/dashboard");
    } catch (err) {
      toastError({
        title: "Could not create school",
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schoolName">School Name *</Label>
              <Input id="schoolName" placeholder="e.g. Kampala Parents School" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="district">District *</Label>
                <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)} className={selectClass}>
                  <option value="">Select district</option>
                  {UGANDA_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schoolType">School Type</Label>
                <select id="schoolType" value={schoolType} onChange={(e) => setSchoolType(e.target.value as typeof schoolType)} className={selectClass}>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                  <option value="nursery">Nursery</option>
                  <option value="both">Both (Primary &amp; Secondary)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" placeholder="P.O. Box 123, Kampala" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" placeholder="+256 700 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="info@school.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="motto">School Motto</Label>
              <Input id="motto" placeholder="e.g. Excellence Through Discipline" value={motto} onChange={(e) => setMotto(e.target.value)} />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-muted mb-6">
                Upload your school logo. This will appear on report cards, receipts, and the parent portal.
              </p>
              <div
                className="relative w-40 h-40 mx-auto rounded-3xl border-2 border-dashed border-border-strong hover:border-primary transition-all cursor-pointer overflow-hidden group bg-bg-tertiary"
                onClick={() => document.getElementById("logo-upload")?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted group-hover:text-secondary transition-colors">
                    <div className="h-12 w-12 rounded-2xl bg-bg-tertiary ring-1 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-xs font-semibold">Click to upload</span>
                  </div>
                )}
                {logoPreview && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-semibold">Change</span>
                  </div>
                )}
              </div>
              <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              {logoFile && (
                <p className="text-sm text-success-600 dark:text-success-400 mt-2 font-medium">{logoFile.name} selected</p>
              )}
              <p className="text-xs text-muted mt-2">Recommended: 500×500 px, PNG or JPG, max 2 MB</p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" placeholder="John Mukasa" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email *</Label>
              <Input id="adminEmail" type="email" placeholder="john@school.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              <p className="text-xs text-muted">This will be your login email</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-muted hover:text-heading transition-colors rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirmPassword}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-muted hover:text-heading transition-colors rounded-r-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-5">
            <p className="text-center text-muted">
              Choose a plan to start with. You get a <span className="text-primary font-semibold">30-day free trial</span> on any plan.
            </p>
            <div className="grid gap-3">
              {PLANS.map((plan) => (
                <motion.button
                  key={plan.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                    selectedPlan === plan.id
                      ? "border-primary bg-bg-tertiary shadow-card"
                      : "border-border bg-card hover:border-border-strong"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2 right-4 inline-flex items-center gap-1 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-card">
                      <Sparkles className="h-2.5 w-2.5" />
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                    <div className="text-right">
                      <span className="text-2xl font-bold">UGX {plan.price}</span>
                      <span className="text-muted text-sm">/month</span>
                    </div>
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="text-sm text-heading-500 flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400 flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {selectedPlan === plan.id && (
                    <motion.div
                      layoutId="plan-check"
                      className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-card"
                    >
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
            <p className="text-center text-xs text-muted">
              No credit card required for trial. Cancel anytime.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden" suppressHydrationWarning>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb w-[420px] h-[420px] -top-32 -right-32" />
        <div className="orb w-[380px] h-[380px] -bottom-24 -left-24" style={{ animationDelay: "-6s" }} />
      </div>

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-2xl"
      >
        <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-heading mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <Card className="shadow-pop">
          <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" />

          <CardHeader>
            <div className="flex items-center justify-center gap-2 mb-4">
              {STEPS.map((s, i) => {
                const isDone = i < step;
                const isActive = i === step;
                return (
                  <div key={i} className="flex items-center">
                    <motion.div
                      animate={{ scale: isActive ? 1.05 : 1 }}
                      className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                        isDone ? " text-white shadow-card"
                          : isActive ? " text-white shadow-card"
                          : "bg-bg-tertiary text-muted border border-border"
                      }`}
                    >
                      {isDone ? <Check className="w-4 h-4" strokeWidth={3} /> : <s.icon className="w-4 h-4" />}
                    </motion.div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-8 sm:w-12 h-0.5 mx-1 rounded transition-all ${isDone ? "" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <CardTitle className="text-center text-2xl">{STEPS[step].title}</CardTitle>
            <CardDescription className="text-center">
              Step {step + 1} of {STEPS.length}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </CardContent>

          <div className="flex items-center justify-between p-6 pt-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={handleNext} variant="default">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading} variant="default" size="lg">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating school...
                  </>
                ) : (
                  <>
                    Start Free Trial
                    <Check className="w-4 h-4 ml-2" strokeWidth={3} />
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
