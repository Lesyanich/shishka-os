import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useReceiptInbox } from '../hooks/useReceiptInbox'
import { BatchUploader } from '../components/receipts/BatchUploader'
import { InboxList } from '../components/receipts/InboxList'

export function ReceiptInbox() {
  const { rows, isLoading, error, refetch, insert, parseReceipt, batchProcess, approve, skip, reopen, resetToPending, deleteRow, deleteManyRows, approveManyRows } = useReceiptInbox()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Receipt Inbox</h1>
          <p className="mt-1 text-xs text-slate-500">
            Upload receipt photos — AI parses them in real time.
          </p>
        </div>
        <Link
          to="/handbook/checking-receipts"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-honey-300 hover:bg-slate-800"
        >
          <BookOpen className="h-3.5 w-3.5" />
          How to check receipts
        </Link>
      </div>

      {/* Uploader (with integrated voice/text notes) */}
      <BatchUploader onBatchProcess={batchProcess} onInsert={insert} onParse={parseReceipt} />

      {/* List */}
      <InboxList
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRefetch={refetch}
        onParse={parseReceipt}
        onApprove={approve}
        onSkip={skip}
        onReopen={reopen}
        onResetToPending={resetToPending}
        onDelete={deleteRow}
        onDeleteMany={deleteManyRows}
        onApproveMany={approveManyRows}
      />
    </div>
  )
}
