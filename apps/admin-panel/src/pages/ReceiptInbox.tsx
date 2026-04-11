import { useReceiptInbox } from '../hooks/useReceiptInbox'
import { InboxUploader } from '../components/receipts/InboxUploader'
import { InboxList } from '../components/receipts/InboxList'

export function ReceiptInbox() {
  const { rows, isLoading, error, refetch, insert, parseReceipt, approve, skip, reopen, resetToPending, deleteRow, deleteManyRows } = useReceiptInbox()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Receipt Inbox</h1>
        <p className="mt-1 text-xs text-slate-500">
          Upload receipt photos — AI parses them in real time. Or queue for the agent.
        </p>
      </div>

      {/* Uploader */}
      <InboxUploader onSubmit={insert} onParse={parseReceipt} />

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
      />
    </div>
  )
}
