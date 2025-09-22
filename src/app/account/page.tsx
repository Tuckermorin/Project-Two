"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

export default function AccountPage() {
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account</h1>
          <p className="text-gray-600">Manage your profile, preferences, and integrations.</p>
        </div>
        <Badge variant="outline" className="text-xs">Auth wiring pending</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" value="you@example.com" readOnly className="bg-gray-100" />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Input value="Free tier" readOnly className="bg-gray-100" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled>Save changes</Button>
              <Button type="button" variant="outline" disabled>Cancel</Button>
            </div>
            <p className="text-xs text-gray-500">
              Connect real authentication to enable profile updates (see <code>CODEX.md</code>).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>1. Configure auth provider keys in <code>.env</code>.</p>
            <p>2. Connect Supabase Auth or NextAuth session provider in <code>src/app/layout.tsx</code>.</p>
            <p>3. Replace the disabled buttons with real mutations once sessions are available.</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
