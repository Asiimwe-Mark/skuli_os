'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBrowserClient } from '@/lib/supabase/client';
import { isValidUgandaPhone, normalizePhone } from '@/lib/utils/phone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { User, Phone, Mail, Lock, Loader2, CheckCircle2 } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const phoneSchema = z.object({
  phone: z.string().refine(isValidUgandaPhone, 'Enter a valid Uganda phone number (e.g. 0700000000)'),
});

const emailSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type EmailFormData = z.infer<typeof emailSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function PortalProfilePage() {
  const supabase = createBrowserClient();
  const { toast } = useToast();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(true);

  const phoneForm = useForm<PhoneFormData>({ resolver: zodResolver(phoneSchema) });
  const emailForm = useForm<EmailFormData>({ resolver: zodResolver(emailSchema) });
  const passwordForm = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

  const [phoneSaving, setPhoneSaving] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      setUser(authUser);
      emailForm.setValue('email', authUser.email || '');

      const { data: profile } = await supabase
        .from('users')
        .select('full_name, phone')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setProfileName(profile.full_name);
        if (profile.phone) {
          phoneForm.setValue('phone', profile.phone);
        }
      }

      setLoading(false);
    }
    loadProfile();
  }, [supabase, phoneForm, emailForm]);

  async function handlePhoneSubmit(data: PhoneFormData) {
    if (!user) return;
    setPhoneSaving(true);
    try {
      const normalized = normalizePhone(data.phone);
      const { error } = await supabase
        .from('users')
        .update({ phone: normalized })
        .eq('id', user.id);

      if (error) throw error;
      toast({ title: 'Phone updated', description: `Phone number set to ${normalized}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update phone';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleEmailSubmit(data: EmailFormData) {
    if (!user) return;
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: data.email });
      if (error) throw error;
      toast({ title: 'Email update initiated', description: 'Check your new email for a confirmation link.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update email';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setEmailSaving(false);
    }
  }

  async function handlePasswordSubmit(data: PasswordFormData) {
    setPasswordSaving(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: data.currentPassword,
      });
      if (signInError) {
        toast({ title: 'Error', description: 'Current password is incorrect', variant: 'destructive' });
        setPasswordSaving(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) throw error;

      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      passwordForm.reset();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account settings</p>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5 text-indigo-600" />
            Account Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{profileName || 'Parent'}</p>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phone Number */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Phone className="w-5 h-5 text-indigo-600" />
            Phone Number
          </CardTitle>
          <CardDescription>Update your phone number in Uganda format</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={phoneForm.handleSubmit(handlePhoneSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="0700000000"
                {...phoneForm.register('phone')}
              />
              {phoneForm.formState.errors.phone && (
                <p className="text-sm text-red-500">{phoneForm.formState.errors.phone.message}</p>
              )}
            </div>
            <Button type="submit" disabled={phoneSaving}>
              {phoneSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Update Phone</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5 text-indigo-600" />
            Email Address
          </CardTitle>
          <CardDescription>Changing your email will require confirmation at the new address</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...emailForm.register('email')}
              />
              {emailForm.formState.errors.email && (
                <p className="text-sm text-red-500">{emailForm.formState.errors.email.message}</p>
              )}
            </div>
            <Button type="submit" disabled={emailSaving}>
              {emailSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Update Email</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-indigo-600" />
            Change Password
          </CardTitle>
          <CardDescription>You&apos;ll need your current password to set a new one</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="••••••••"
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-red-500">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Minimum 8 characters"
                {...passwordForm.register('newPassword')}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-red-500">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                {...passwordForm.register('confirmPassword')}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500">{passwordForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" />Change Password</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
