import { useCallback, useRef, useState } from 'react'
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { useDishPhotoUpload, type DishPhotoRole } from '../../../../hooks/useDishPhotoUpload'

interface PhotoUploadProps {
  /** Current photo URL persisted in DB (or null when none). */
  photoUrl: string | null
  /** Which role-folder to upload into. */
  role: DishPhotoRole
  /** Nomenclature ID — used as the file basename. */
  nomenclatureId: string
  /** Called with the new public URL after a successful upload. Caller
   * persists it to the appropriate column. Pass `null` to clear. */
  onChange: (newUrl: string | null) => void
  /** Visible label above the slot. */
  label: string
}

export function PhotoUpload({
  photoUrl,
  role,
  nomenclatureId,
  onChange,
  label,
}: PhotoUploadProps) {
  const { upload, isUploading, error } = useDishPhotoUpload()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      setLocalError(null)
      const result = await upload(file, role, nomenclatureId)
      if (result.ok && result.url) {
        onChange(result.url)
      } else if (result.error) {
        setLocalError(result.error)
      }
    },
    [upload, role, nomenclatureId, onChange],
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const showError = error ?? localError

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
        <ImageIcon className="mr-1 inline h-3 w-3" />
        {label}
      </h4>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative aspect-[4/3] w-full overflow-hidden rounded-lg border-2 border-dashed transition ${
          dragging
            ? 'border-forest-soft bg-[var(--color-royal-green)]/10'
            : 'border-surface-3 bg-surface-2/40'
        }`}
      >
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt={label}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white/80 transition hover:bg-black/80 hover:text-white"
              title="Remove photo"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-xs text-cream/40 transition hover:text-cream/70 disabled:cursor-wait"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-forest-soft" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            <span>
              {isUploading ? 'Uploading...' : 'Drop image or click'}
            </span>
            <span className="text-[10px] text-cream/30">
              JPEG / PNG / WebP &middot; max 3 MB
            </span>
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onInputChange}
          className="hidden"
        />
      </div>

      {photoUrl && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="text-[10px] text-cream/50 hover:text-cream/80"
        >
          {isUploading ? 'Uploading...' : 'Replace photo'}
        </button>
      )}

      {showError && (
        <p className="text-[10px] text-[color:var(--color-brick-soft)]">
          {showError}
        </p>
      )}
    </section>
  )
}
