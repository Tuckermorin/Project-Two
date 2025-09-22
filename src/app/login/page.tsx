"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-2xl font-semibold text-center">Welcome back</CardTitle>
          <p className="text-sm text-gray-500 text-center">Sign in to access your personalized dashboard.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/reset" className="text-xs text-blue-600 hover:underline">Forgot?</Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled>
              Sign In
            </Button>
          </form>

          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-700 flex gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              Authentication wiring is pending. See <code>CODEX.md</code> for the Supabase / NextAuth setup checklist.
            </div>
          </div>

          <p className="text-sm text-center text-gray-600">
            Don&apos;t have an account? <Link href="/account" className="text-blue-600 hover:underline">Create one</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
