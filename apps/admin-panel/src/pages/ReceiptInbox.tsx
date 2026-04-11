import { useReceiptInbox } from '../hooks/useReceiptInbox'
import { InboxUploader } from '../components/receipts/InboxUploader'
import { InboxList } from '../components/receipts/InboxList'

export function ReceiptInbox() {
  const { rows, isLoading, error, refetch, insert, parseReceipt, approve, skip, reopen, resetToPending, deleteRow } = useReceiptInbox()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Загрузка чеков</h1>
        <p className="mt-1 text-xs text-slate-500">
          Загрузите фото чеков — AI распознает их в реальном времени. Или поставьте в очередь для агента.
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
      />
    </div>
  )
}
