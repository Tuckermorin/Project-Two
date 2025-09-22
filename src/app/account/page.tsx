"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"
import { useSession, useSupabaseClient } from "@supabase/auth-helpers-react"

export default function AccountPage() {
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const session = useSession()
  const supabase = useSupabaseClient()
  const router = useRouter()

  const user = session?.user

  useEffect(() => {
    if (!user) return
    setDisplayName(user.user_metadata?.display_name ?? '')
    const metadataPhone = user.user_metadata?.phone ?? ''
    setPhone(metadataPhone)
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setLoading(true)
    setErrorMessage(null)
    setStatusMessage(null)
    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: displayName,
        phone,
      },
    })
    if (error) {
      setErrorMessage(error.message)
    } else {
      setStatusMessage('Profile updated successfully.')
      router.refresh()
    }
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              You need to be signed in to manage your account.
            </div>
            <Button asChild>
              <Link href="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

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
                <Input id="email" value={user.email ?? ''} readOnly className="bg-gray-100" />
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
              <Button type="button" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => handleSignOut()}>
                Sign out
              </Button>
            </div>
            {statusMessage && (
              <p className="text-xs text-green-600">{statusMessage}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-600">{errorMessage}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>Signed in as <span className="font-semibold">{user.email}</span>.</p>
            <p>Use the form to update your display name or phone. This data is stored in your Supabase user metadata.</p>
            <p>Need to manage your password? Use the Supabase dashboard to enable reset emails.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
