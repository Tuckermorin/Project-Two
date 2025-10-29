'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  TrendingUp,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Sparkles,
  User,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { toast } from 'sonner';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    // Validate password strength
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      const { error: signUpError } = await signUp(formData.email, formData.password, {
        name: formData.name,
      });

      if (signUpError) throw signUpError;

      setSuccess(true);
      toast.success('Account created! Check your email to verify.');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
      toast.error(err.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob"
            style={{
              top: '10%',
              left: '10%',
              background: 'var(--gradient-primary-start)'
            }}
          ></div>
          <div
            className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob animation-delay-2000"
            style={{
              top: '20%',
              right: '10%',
              background: 'var(--gradient-primary-end)'
            }}
          ></div>
          <div
            className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob animation-delay-4000"
            style={{
              bottom: '10%',
              left: '30%',
              background: 'var(--gradient-secondary-start)'
            }}
          ></div>
        </div>

        {/* Success Card */}
        <div className="relative w-full max-w-md">
          <div
            className="glass-card p-8 md:p-10"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
            }}
          >
            <div className="text-center mb-6">
              <div className="flex justify-center mb-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--gradient-success-start), var(--gradient-success-end))',
                    boxShadow: '0 4px 20px rgba(74, 222, 128, 0.4)'
                  }}
                >
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>
              <h1
                className="text-3xl font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Check Your Email
              </h1>
              <p style={{ color: 'var(--text-secondary)' }}>
                We&apos;ve sent you a confirmation link
              </p>
            </div>

            <div
              className="p-4 rounded-lg mb-6"
              style={{
                background: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid rgba(74, 222, 128, 0.3)'
              }}
            >
              <p className="text-sm" style={{ color: 'var(--text-positive)' }}>
                <strong>Account created successfully!</strong>
              </p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                Please check your inbox and verify your email address to get started.
              </p>
            </div>

            <Button
              onClick={() => router.push('/login')}
              className="w-full"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-primary-start), var(--gradient-primary-end))',
                color: 'white',
                border: '1px solid var(--glass-border)'
              }}
            >
              Go to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob"
          style={{
            top: '10%',
            left: '10%',
            background: 'var(--gradient-primary-start)'
          }}
        ></div>
        <div
          className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob animation-delay-2000"
          style={{
            top: '20%',
            right: '10%',
            background: 'var(--gradient-primary-end)'
          }}
        ></div>
        <div
          className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl animate-blob animation-delay-4000"
          style={{
            bottom: '10%',
            left: '30%',
            background: 'var(--gradient-secondary-start)'
          }}
        ></div>
      </div>

      {/* Glass Sign Up Card */}
      <div className="relative w-full max-w-md">
        <div
          className="glass-card p-8 md:p-10"
          style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
          }}
        >
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, var(--gradient-primary-start), var(--gradient-primary-end))',
                  boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)'
                }}
              >
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Create Account
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Start your paper trading journey
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="mb-6 p-3 rounded-lg flex items-start gap-2"
              style={{
                background: 'rgba(248, 113, 113, 0.1)',
                border: '1px solid rgba(248, 113, 113, 0.3)'
              }}
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Sign Up Form */}
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <Label
                htmlFor="name"
                style={{ color: 'var(--text-secondary)' }}
              >
                <User className="w-4 h-4 inline mr-2" />
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1 glass-input"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div>
              <Label
                htmlFor="email"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Mail className="w-4 h-4 inline mr-2" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1 glass-input"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div>
              <Label
                htmlFor="password"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Lock className="w-4 h-4 inline mr-2" />
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  disabled={isLoading}
                  className="glass-input pr-10"
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: 'var(--text-tertiary)' }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Must be at least 6 characters
              </p>
            </div>

            <div>
              <Label
                htmlFor="confirmPassword"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Lock className="w-4 h-4 inline mr-2" />
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                disabled={isLoading}
                className="mt-1 glass-input"
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              style={{
                background: 'linear-gradient(135deg, var(--gradient-primary-start), var(--gradient-primary-end))',
                color: 'white',
                border: '1px solid var(--glass-border)'
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create account
                </>
              )}
            </Button>
          </form>

          {/* Sign in link */}
          <p
            className="text-center text-sm mt-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium hover:underline"
              style={{ color: 'var(--gradient-primary-start)' }}
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
