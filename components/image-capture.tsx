'use client'

import { useRef, useState, useCallback } from 'react'
import { Camera, Upload, X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageCaptureProps {
  onImageCaptured: (file: File, previewUrl: string) => void
}

export function ImageCapture({ onImageCaptured }: ImageCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      const url = URL.createObjectURL(file)
      setPreview(url)
      onImageCaptured(file, url)
    },
    [onImageCaptured]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleClear = () => {
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  return (
    <div className="w-full">
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border-2 border-accent/40 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Captured invoice"
            className="w-full object-contain max-h-72"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 bg-primary/80 text-primary-foreground rounded-full p-1.5 hover:bg-primary transition-colors"
            aria-label="Remove image"
          >
            <X size={16} />
          </button>
          <button
            onClick={handleClear}
            className="absolute bottom-2 right-2 bg-accent text-foreground rounded-full p-1.5 hover:bg-accent/80 transition-colors"
            aria-label="Retake photo"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-accent bg-accent/10'
              : 'border-border bg-muted/50 hover:border-accent/60'
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center">
              <Camera size={28} className="text-accent" />
            </div>
            <div>
              <p className="font-serif text-foreground font-semibold text-base">
                Capture Invoice
              </p>
              <p className="text-muted-foreground text-sm mt-0.5">
                Take a photo or upload from gallery
              </p>
            </div>
            <div className="flex gap-3 mt-1 w-full">
              <Button
                variant="default"
                className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-brown-mid"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera size={16} />
                Camera
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-accent/60 text-foreground hover:bg-accent/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Camera capture input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Take photo with camera"
      />
      {/* Gallery upload input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload image from gallery"
      />
    </div>
  )
}
