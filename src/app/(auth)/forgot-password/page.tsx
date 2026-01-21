'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      })

      if (error) throw error
      setSuccess(true)
    } catch (error: any) {
      setError(error.message || 'An error occurred while sending the reset email')
    } finally {
      setLoading(false)
    }
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
              Check your email
            </CardDescription>
            <CardDescription className="text-center text-muted-foreground">
              {"We've sent a password reset link to"} {email}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Please check your email and click the reset link to set a new password. The link will expire in 24 hours.
            </p>
          </CardContent>
          <CardFooter>
            <Link href="/login" className="w-full">
              <Button 
                variant="outline" 
                className="w-full border-border hover:bg-accent/10 hover:border-primary transition-colors"
              >
                Return to login
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
            Reset your password
          </CardDescription>
          <CardDescription className="text-center text-muted-foreground">
            {"Enter your email address and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="text-sm text-muted-foreground text-center">
            Remember your password?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
