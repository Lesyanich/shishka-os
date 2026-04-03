import { useReceiptInbox } from '../hooks/useReceiptInbox'
import { InboxUploader } from '../components/receipts/InboxUploader'
import { InboxList } from '../components/receipts/InboxList'

export function ReceiptInbox() {
  const { rows, isLoading, error, refetch, insert } = useReceiptInbox()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">Загрузка чеков</h1>
        <p className="mt-1 text-xs text-slate-500">
          Загрузите фото чеков для обработки агентом. Без AI — только фото + метаданные.
        </p>
      </div>

      {/* Uploader */}
      <InboxUploader onSubmit={insert} />

      {/* List */}
      <InboxList rows={rows} isLoading={isLoading} error={error} onRefetch={refetch} />
    </div>
  )
}
