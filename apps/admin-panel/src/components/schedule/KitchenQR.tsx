import { useEffect, useRef, useState } from 'react'
import { QrCode, Printer } from 'lucide-react'
import QRCode from 'qrcode'

export function KitchenQR() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [kitchenUrl, setKitchenUrl] = useState('')

  useEffect(() => {
    const url = `${window.location.origin}/kitchen`
    setKitchenUrl(url)

    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 200,
        margin: 2,
        color: { dark: '#e2e8f0', light: '#020617' },
      })
    }
  }, [])

  function handlePrint() {
    const canvas = canvasRef.current
    if (!canvas) return

    const dataUrl = canvas.toDataURL('image/png')
    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>Shishka Kitchen QR</title>
      <style>
        body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: sans-serif; }
        img { width: 300px; height: 300px; }
        h2 { margin-bottom: 8px; }
        p { color: #666; font-size: 14px; margin-top: 4px; }
      </style></head>
      <body>
        <h2>Shishka Kitchen</h2>
        <img src="${dataUrl}" />
        <p>${kitchenUrl}</p>
        <script>window.onload = () => { window.print(); }</script>
      </body>
      </html>
    `)
    win.document.close()
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
        <QrCode className="h-4 w-4 text-emerald-400" />
        Kitchen QR Code
      </h3>
      <div className="flex flex-wrap items-center gap-4">
        <canvas ref={canvasRef} className="rounded-lg" />
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Open <span className="font-mono text-slate-300">/kitchen</span> on any device
          </p>
          <p className="text-xs text-slate-500 break-all">{kitchenUrl}</p>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Print QR
          </button>
        </div>
      </div>
    </div>
  )
}
