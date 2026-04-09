import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-6">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
          Authentication Error
        </h1>
        <p className="text-muted-foreground mb-6">
          Something went wrong during authentication. Please try again.
        </p>
        <Link
          href="/auth/login"
          className="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )
}
