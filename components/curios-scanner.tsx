'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Scan, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImageCapture } from '@/components/image-capture'
import { CuriosForm } from '@/components/curios-form'
import { saveCuriosSheet } from '@/lib/actions/curios'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedCuriosData, Seller } from '@/lib/schema'

type Step = 'capture' | 'extracting' | 'review' | 'saved'

interface CuriosScannerProps {
  sellers: Seller[]
}

export function CuriosScanner({ sellers }: CuriosScannerProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('capture')
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<ExtractedCuriosData | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showRawText, setShowRawText] = useState(false)

  const handleImageCaptured = useCallback((file: File, url: string) => {
    setCapturedFile(file)
    setPreviewUrl(url)
    setExtractedData(null)
    setExtractError(null)
  }, [])

  const handleExtract = async () => {
    if (!capturedFile) return
    setStep('extracting')
    setExtractError(null)

    try {
      const formData = new FormData()
      formData.append('image', capturedFile)

      const res = await fetch('/api/extract-curios', {
        method: 'POST',
        body: formData,
      })

      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        const text = await res.text()
        console.error('[v0] Non-JSON response from curios API:', res.status, text.slice(0, 200))
        throw new Error(`Server error (${res.status}). Please try again in a moment.`)
      }

      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'Extraction failed')

      const data: ExtractedCuriosData = {
        ...json.data,
        image_url: previewUrl,
        entries: json.data.entries ?? [],
      }

      setExtractedData(data)
      setStep('review')
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Unknown error')
      setStep('capture')
    }
  }

  const handleManualEntry = () => {
    setExtractedData({
      sheet_date: null,
      entries: [],
      notes: null,
      image_url: previewUrl,
      raw_text: null,
    })
    setStep('review')
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `curios/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (error) {
        console.error('[v0] Storage upload error:', error.message)
        return null
      }
      const { data } = supabase.storage.from('documents').getPublicUrl(path)
      return data.publicUrl
    } catch (err) {
      console.error('[v0] Storage upload failed:', err)
      return null
    }
  }

  const handleSave = async (data: ExtractedCuriosData) => {
    setIsSaving(true)
    try {
      // Upload image to Supabase Storage first
      let storageUrl = data.image_url
      if (capturedFile) {
        const uploaded = await uploadImage(capturedFile)
        if (uploaded) storageUrl = uploaded
      }

      const result = await saveCuriosSheet({ ...data, image_url: storageUrl })
      if (result.error) {
        setExtractError(result.error)
      } else {
        setStep('saved')
        setTimeout(() => router.push('/curios'), 1500)
      }
    } catch {
      setExtractError('Failed to save curios sheet')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setStep('capture')
    setCapturedFile(null)
    setPreviewUrl(null)
    setExtractedData(null)
    setExtractError(null)
  }

  if (step === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={36} className="text-green-600" />
        </div>
        <h2 className="font-serif text-xl font-bold text-foreground">Curios Sheet Saved!</h2>
        <p className="text-muted-foreground text-sm">Redirecting to curios records...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['capture', 'review'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s || (step === 'extracting' && s === 'capture')
                  ? 'bg-primary text-primary-foreground'
                  : step === 'review' && s === 'capture'
                  ? 'bg-accent text-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {step === 'review' && s === 'capture' ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s === 'capture' ? 'Capture' : 'Review & Save'}
            </span>
            {i === 0 && <div className="flex-1 h-px bg-border mx-1 w-8" />}
          </div>
        ))}
      </div>

      {/* Error */}
      {extractError && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <AlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive">{extractError}</p>
        </div>
      )}

      {/* Capture step */}
      {(step === 'capture' || step === 'extracting') && (
        <div className="space-y-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-foreground text-balance">
              Scan Curios Sales Sheet
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Take a clear photo of the curios sales sheet or enter manually.
            </p>
          </div>

          <ImageCapture onImageCaptured={handleImageCaptured} />

          {capturedFile && step !== 'extracting' && (
            <div className="space-y-2">
              <Button
                onClick={handleExtract}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6 text-base rounded-xl gap-2"
              >
                <Scan size={18} />
                Extract Curios Details
              </Button>
              <button
                onClick={handleManualEntry}
                className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 underline underline-offset-2"
              >
                Skip scan — enter manually
              </button>
            </div>
          )}

          {!capturedFile && (
            <button
              onClick={handleManualEntry}
              className="w-full text-sm text-accent hover:text-accent/80 text-center py-3 border border-dashed border-accent/40 rounded-xl transition-colors"
            >
              Enter curios manually without scanning
            </button>
          )}

          {step === 'extracting' && (
            <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 border-accent/30 border-t-accent animate-spin" />
              <div className="text-center">
                <p className="font-serif text-foreground font-semibold">Analysing Curios Sheet...</p>
                <p className="text-sm text-muted-foreground mt-0.5">AI is reading the sales entries</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review step */}
      {step === 'review' && extractedData && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-serif text-lg font-bold text-foreground">Review & Edit</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Check entries and commissions before saving.
              </p>
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-accent underline underline-offset-2 flex-shrink-0 mt-1"
            >
              Rescan
            </button>
          </div>

          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-border/60 max-h-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Curios sales sheet" className="w-full object-cover max-h-40" />
            </div>
          )}

          {extractedData.raw_text && (
            <button
              onClick={() => setShowRawText((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showRawText ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showRawText ? 'Hide' : 'Show'} full transcription
            </button>
          )}
          {showRawText && extractedData.raw_text && (
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap max-h-36 overflow-y-auto">
              {extractedData.raw_text}
            </div>
          )}

          <CuriosForm
            data={extractedData}
            sellers={sellers}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>
      )}
    </div>
  )
}
