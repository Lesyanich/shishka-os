import { createContext, useContext, type ReactNode } from 'react'
import { useExpenseLedger, type UseExpenseLedgerResult } from '../hooks/useExpenseLedger'

const FinanceContext = createContext<UseExpenseLedgerResult | null>(null)

export function FinanceProvider({ children }: { children: ReactNode }) {
  const data = useExpenseLedger()
  return <FinanceContext.Provider value={data}>{children}</FinanceContext.Provider>
}

export function useFinance(): UseExpenseLedgerResult {
  const ctx = useContext(FinanceContext)
  if (!ctx) throw new Error('useFinance must be used within <FinanceProvider>')
  return ctx
}
