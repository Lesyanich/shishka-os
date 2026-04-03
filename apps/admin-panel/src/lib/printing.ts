// Интерфейс для будущей печати — НЕ реализовывать, только типы
export interface PrintJob {
  type: 'label' | 'receipt' | 'report'
  templateId: string
  data: Record<string, unknown>
  copies: number
  printer?: string  // IP-адрес или имя принтера
}

export interface PrintService {
  print(job: PrintJob): Promise<{ success: boolean; error?: string }>
  getAvailablePrinters(): Promise<string[]>
}

// Заглушка — возвращает "печать недоступна"
export const printService: PrintService = {
  async print() { return { success: false, error: 'Printer not configured' } },
  async getAvailablePrinters() { return [] },
}
