"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/components/auth/auth-provider"
import { toast } from "sonner"
import { Loader2, User, Mail, Phone, Key, CheckCircle, XCircle, Calendar } from "lucide-react"

export default function AccountPage() {
  const { user, loading: authLoading } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Load user profile data
  useEffect(() => {
    if (user) {
      fetchProfile()
    }
  }, [user])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/profile')
      if (!response.ok) {
        throw new Error('Failed to fetch profile')
      }
      const data = await response.json()
      setDisplayName(data.user.display_name || '')
      setPhone(data.user.phone || '')
    } catch (error) {
      console.error('Error fetching profile:', error)
      toast.error('Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          phone: phone
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update profile')
      }

      toast.success('Profile updated successfully')
      setHasChanges(false)
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    try {
      setChangingPassword(true)

      // Use Supabase client directly for password update
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        throw error
      }

      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      console.error('Error changing password:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleInputChange = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setHasChanges(true)
  }

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-4xl">
        <Card>
          <CardContent className="text-center py-12">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Not Authenticated</h3>
            <p className="text-gray-600 mb-4">Please sign in to view your account</p>
            <Button asChild>
              <a href="/login">Go to Login</a>
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
          <p className="text-gray-600">Manage your profile and security settings</p>
        </div>
        <Badge variant={user.email_confirmed_at ? "default" : "secondary"}>
          {user.email_confirmed_at ? (
            <>
              <CheckCircle className="h-3 w-3 mr-1" />
              Verified
            </>
          ) : (
            <>
              <XCircle className="h-3 w-3 mr-1" />
              Unverified
            </>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Information */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="displayName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Display Name
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => handleInputChange(setDisplayName)(e.target.value)}
                  placeholder="Your name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  value={user.email || ''}
                  readOnly
                  className="bg-gray-50 mt-1"
                />
              </div>
              <div>
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => handleInputChange(setPhone)(e.target.value)}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Member Since
                </Label>
                <Input
                  value={formatDate(user.created_at)}
                  readOnly
                  className="bg-gray-50 mt-1"
                />
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleSaveProfile}
                disabled={!hasChanges || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  fetchProfile()
                  setHasChanges(false)
                }}
                disabled={!hasChanges || saving}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <Label className="text-xs text-gray-500">Email Status</Label>
              <p className="mt-1">
                {user.email_confirmed_at ? (
                  <Badge variant="default" className="text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    Unverified
                  </Badge>
                )}
              </p>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Last Sign In</Label>
              <p className="text-xs mt-1">{formatDate(user.last_sign_in_at)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="mt-1"
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={handlePasswordChange}
              disabled={!newPassword || !confirmPassword || changingPassword}
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Changing Password...
                </>
              ) : (
                'Change Password'
              )}
            </Button>
            <p className="text-xs text-gray-500">
              Password must be at least 6 characters long
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
