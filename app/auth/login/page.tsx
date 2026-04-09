'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error
      router.push('/sheets')
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[#5C3D2E] opacity-90" />
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12 text-center">
          <div className="mb-8">
            <Image
              src="/logo.jpg"
              alt="Village Bakery"
              width={200}
              height={80}
              className="rounded-xl shadow-2xl"
            />
          </div>
          <h1 className="font-serif text-5xl font-bold text-cream mb-4 tracking-tight">
            Village Bakery
          </h1>
          <p className="text-accent text-lg max-w-md leading-relaxed">
            Cash Up & Curios Management System
          </p>
          <div className="mt-12 grid grid-cols-2 gap-6 max-w-md w-full">
            <div className="bg-cream/10 backdrop-blur-sm rounded-xl p-4 border border-accent/20">
              <p className="text-3xl font-bold text-cream mb-1">Daily</p>
              <p className="text-sm text-accent">Cash Tracking</p>
            </div>
            <div className="bg-cream/10 backdrop-blur-sm rounded-xl p-4 border border-accent/20">
              <p className="text-3xl font-bold text-cream mb-1">Analytics</p>
              <p className="text-sm text-accent">Revenue Insights</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-cream">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Image
              src="/logo.jpg"
              alt="Village Bakery"
              width={150}
              height={60}
              className="mx-auto rounded-lg shadow-lg"
            />
            <h2 className="font-serif text-2xl font-bold text-primary mt-4">
              Village Bakery
            </h2>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 border border-border">
            <div className="mb-8">
              <h2 className="font-serif text-3xl font-bold text-foreground mb-2">
                Welcome Back
              </h2>
              <p className="text-muted-foreground">
                Sign in to access your dashboard
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@villagebakery.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 bg-background border-border text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-background border-border text-foreground"
                />
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Users are managed by administrators
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Secure access to Village Bakery operations
          </p>
        </div>
      </div>
    </div>
  )
}
