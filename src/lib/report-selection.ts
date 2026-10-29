/** A pending/failed historical request must never display a different revision. */
export function selectReportForView<Latest extends { id: string }, Detail extends { id: string }>(
  selectedId: string,
  latest: Latest | null | undefined,
  detail: Detail | null | undefined,
): Latest | Detail | null {
  if (detail?.id === selectedId) return detail
  if (latest?.id === selectedId) return latest
  return null
}
