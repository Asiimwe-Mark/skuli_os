"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
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
} from "lucide-react";
import Link from "next/link";
import { UGANDA_DISTRICTS } from "@/lib/utils/uganda-districts";

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
  { title: "School Logo", icon: Upload },
  { title: "Admin Account", icon: UserPlus },
  { title: "Choose Plan", icon: CreditCard },
];

export default function OnboardPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: School Details
  const [schoolName, setSchoolName] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [schoolType, setSchoolType] = useState<"primary" | "secondary" | "both">("both");
  const [motto, setMotto] = useState("");

  // Step 2: Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 3: Admin Account
  const [fullName, setFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 4: Plan
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
    setError("");
    switch (step) {
      case 0:
        if (!schoolName.trim()) { setError("School name is required"); return false; }
        if (!district) { setError("Please select a district"); return false; }
        if (!phone.trim()) { setError("Phone number is required"); return false; }
        return true;
      case 1:
        return true; // Logo is optional
      case 2:
        if (!fullName.trim()) { setError("Full name is required"); return false; }
        if (!adminEmail.trim()) { setError("Email is required"); return false; }
        if (password.length < 8) { setError("Password must be at least 8 characters"); return false; }
        if (password !== confirmPassword) { setError("Passwords do not match"); return false; }
        return true;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      // 1. Upload logo if provided (before API call)
      let logoUrl: string | null = null;
      if (logoFile) {
        const fileExt = logoFile.name.split(".").pop();
        const filePath = `school-logos/temp-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("school-assets")
          .upload(filePath, logoFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("school-assets")
            .getPublicUrl(filePath);
          logoUrl = urlData.publicUrl;
        }
      }

      // 2. Create school and admin via API (server creates auth user + school + profile)
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
            logo_url: logoUrl,
          },
          admin: {
            full_name: fullName,
            email: adminEmail,
            password,
          },
          plan: selectedPlan,
          start_trial: true,
        }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);

      // 3. Sign in with the newly created credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password,
      });

      if (signInError) {
        // If sign-in fails, redirect to login
        router.push("/login");
        return;
      }

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
              <Input
                id="schoolName"
                placeholder="e.g. Kampala Parents School"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="district">District *</Label>
                <select
                  id="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-navy-50 border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                >
                  <option value="">Select district</option>
                  {UGANDA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="schoolType">School Type</Label>
                <select
                  id="schoolType"
                  value={schoolType}
                  onChange={(e) => setSchoolType(e.target.value as typeof schoolType)}
                  className="w-full h-10 px-3 rounded-md bg-navy-50 border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber"
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="P.O. Box 123, Kampala"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  placeholder="+256 700 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="motto">School Motto</Label>
              <Input
                id="motto"
                placeholder="e.g. Excellence Through Discipline"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
              />
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-muted-foreground mb-6">
                Upload your school logo. This will appear on report cards, receipts, and the parent portal.
              </p>
              <div
                className="relative w-40 h-40 mx-auto rounded-xl border-2 border-dashed border-navy-50 hover:border-amber transition-colors cursor-pointer overflow-hidden group"
                onClick={() => document.getElementById("logo-upload")?.click()}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground group-hover:text-amber transition-colors">
                    <ImageIcon className="w-10 h-10 mb-2" />
                    <span className="text-xs">Click to upload</span>
                  </div>
                )}
              </div>
              <input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoChange}
              />
              {logoFile && (
                <p className="text-sm text-emerald mt-2">
                  {logoFile.name} selected
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Recommended: 500x500px, PNG or JPG, max 2MB
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                placeholder="John Mukasa"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email *</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="john@school.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This will be your login email
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <p className="text-center text-muted-foreground">
              Choose a plan to start with. You get a 30-day free trial on any plan.
            </p>
            <div className="grid gap-4">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                    selectedPlan === plan.id
                      ? "border-amber bg-amber/5 glow-amber"
                      : "border-navy-50 hover:border-navy-50/80"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2 right-4 bg-amber text-navy text-xs font-bold px-2 py-0.5 rounded">
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">{plan.name}</h3>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-amber">
                        UGX {plan.price}
                      </span>
                      <span className="text-muted-foreground text-sm">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="text-sm text-muted-foreground flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {selectedPlan === plan.id && (
                    <motion.div
                      layoutId="plan-check"
                      className="absolute top-4 right-4 w-6 h-6 bg-amber rounded-full flex items-center justify-center"
                    >
                      <Check className="w-4 h-4 text-navy" />
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              No credit card required for trial. Cancel anytime.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 bg-gradient-to-br from-navy via-navy-300 to-navy opacity-50" />
      <div className="fixed top-1/3 left-1/3 w-96 h-96 bg-amber/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <Card className="border-navy-50/50 bg-navy-100/80 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-center gap-2 mb-4">
              {STEPS.map((s, i) => (
                <div key={i} className="flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      i < step
                        ? "bg-emerald text-white"
                        : i === step
                        ? "bg-amber text-navy"
                        : "bg-navy-50 text-muted-foreground"
                    }`}
                  >
                    {i < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`w-12 h-0.5 mx-1 transition-colors ${
                        i < step ? "bg-emerald" : "bg-navy-50"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <CardTitle className="text-center">{STEPS[step].title}</CardTitle>
            <CardDescription className="text-center">
              Step {step + 1} of {STEPS.length}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-rose text-sm mt-4"
              >
                {error}
              </motion.p>
            )}
          </CardContent>

          <div className="flex items-center justify-between p-6 pt-0">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {step < STEPS.length - 1 ? (
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating school...
                  </>
                ) : (
                  <>
                    Start Free Trial
                    <Check className="w-4 h-4 ml-2" />
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
