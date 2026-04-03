export interface ScanResult {
  format: 'ean13' | 'code128' | 'qr' | 'unknown'
  value: string
}

export interface ScannerService {
  isAvailable(): boolean
  startScan(): Promise<ScanResult>
  stopScan(): void
}

// Заглушка
export const scannerService: ScannerService = {
  isAvailable() { return false },
  async startScan() { throw new Error('Scanner not available') },
  stopScan() {},
}
