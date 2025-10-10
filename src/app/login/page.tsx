'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  TrendingUp,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: signInError } = await signIn(email, password);

      if (signInError) throw signInError;

      toast.success('Welcome back!');
      // The signIn function handles the redirect
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      toast.error(err.message || 'Failed to sign in');
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* Glass Login Card */}
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
              Welcome Back
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Sign in to your paper trading account
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

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-tertiary)' }}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  className="border-[var(--glass-border)]"
                />
                <Label
                  htmlFor="remember"
                  className="ml-2 text-sm cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Remember me
                </Label>
              </div>
              <a
                href="/reset"
                className="text-sm hover:underline"
                style={{ color: 'var(--gradient-primary-start)' }}
              >
                Forgot password?
              </a>
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
                  Signing in...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Sign in
                </>
              )}
            </Button>
          </form>

          {/* Sign up link */}
          <p
            className="text-center text-sm mt-6"
            style={{ color: 'var(--text-secondary)' }}
          >
            Don&apos;t have an account?{' '}
            <a
              href="/signup"
              className="font-medium hover:underline"
              style={{ color: 'var(--gradient-primary-start)' }}
            >
              Create account
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
