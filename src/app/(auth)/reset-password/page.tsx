'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      // User should have a session after clicking the recovery link
      setIsValidSession(!!session)
    }
    checkSession()
  }, [supabase.auth])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error
      setSuccess(true)
      
      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    } catch (error: any) {
      setError(error.message || 'An error occurred while resetting your password')
    } finally {
      setLoading(false)
    }
  }

  // Show loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#141414] p-4">
        <Card className="w-full max-w-md border-[#333333]">
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">Verifying your reset link...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error if no valid session
  if (!isValidSession) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#141414] p-4">
        <Card className="w-full max-w-md border-[#333333]">
          <CardHeader className="space-y-6">
            <div className="flex justify-center">
              <Image
                src="/images/Loop-Vesper-White.svg"
                alt="Loop Vesper"
                width={120}
                height={40}
                className="object-contain"
              />
            </div>
            <CardDescription className="text-center text-foreground text-lg font-medium">
              Invalid or Expired Link
            </CardDescription>
            <CardDescription className="text-center text-muted-foreground">
              This password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-2">
            <Link href="/forgot-password" className="w-full">
              <Button 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Request New Reset Link
              </Button>
            </Link>
            <Link href="/login" className="w-full">
              <Button 
                variant="outline" 
                className="w-full border-border hover:bg-accent/10 hover:border-primary transition-colors"
              >
                Return to Login
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-[#141414] p-4">
        <Card className="w-full max-w-md border-[#333333]">
          <CardHeader className="space-y-6">
            <div className="flex justify-center">
              <Image
                src="/images/Loop-Vesper-White.svg"
                alt="Loop Vesper"
                width={120}
                height={40}
                className="object-contain"
              />
            </div>
            <CardDescription className="text-center text-foreground text-lg font-medium">
              Password Reset Successful
            </CardDescription>
            <CardDescription className="text-center text-muted-foreground">
              Your password has been updated successfully. Redirecting to login...
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button 
                variant="outline" 
                className="w-full border-border hover:bg-accent/10 hover:border-primary transition-colors"
              >
                Go to Login Now
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#141414] p-4">
      <Card className="w-full max-w-md border-[#333333]">
        <CardHeader className="space-y-6">
          <div className="flex justify-center">
            <Image
              src="/images/Loop-Vesper-White.svg"
              alt="Loop Vesper"
              width={120}
              height={40}
              className="object-contain"
            />
          </div>
          <CardDescription className="text-center text-foreground text-lg font-medium">
            Set Your New Password
          </CardDescription>
          <CardDescription className="text-center text-muted-foreground">
            Please enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 6 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button 
              type="submit" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" 
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
