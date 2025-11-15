import type { AuditQueueItem, AuditReviewStatus } from '@glass-frontier/dto';
import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useMemo } from 'react';

import type { AuditFilters } from '../../../stores/auditReviewStore';
import { QueueFilters } from './QueueFilters';
import { formatDate, STATUS_LABELS } from './utils';

type AuditGridRow = {
  createdAt: number | string;
  id: string;
  playerId: string;
  providerId: string;
  status: AuditReviewStatus;
  templateLabel: string;
};

type AuditQueuePanelProps = {
  cursor: string | null;
  filters: AuditFilters;
  isLoading: boolean;
  isLoadingMore: boolean;
  items: AuditQueueItem[];
  onApplyFilters: () => void;
  onChangeFilters: (updates: Partial<AuditFilters>) => void;
  onLoadMore: () => void;
  onOpenReview: (storageKey: string) => void;
};

export const AuditQueuePanel = ({
  cursor,
  filters,
  isLoading,
  isLoadingMore,
  items,
  onApplyFilters,
  onChangeFilters,
  onLoadMore,
  onOpenReview,
}: AuditQueuePanelProps) => {
  const rows = useQueueRows(items);
  const columns = useQueueColumns(onOpenReview);
  return (
    <section className="audit-panel audit-queue-panel">
      <div className="audit-panel-header">
        <h2>Review Queue</h2>
        <span className="audit-count">{items.length} items</span>
      </div>
      <QueueFilters
        filters={filters}
        isBusy={isLoading}
        onApply={onApplyFilters}
        onChange={onChangeFilters}
      />
      <AuditQueueTable columns={columns} rows={rows} isLoading={isLoading} />
      <div className="audit-panel-footer">
        <button type="button" onClick={onLoadMore} disabled={!cursor || isLoadingMore}>
          {isLoadingMore ? 'Loading…' : cursor ? 'Load More' : 'End of Queue'}
        </button>
      </div>
    </section>
  );
};

const useQueueRows = (items: AuditQueueItem[]) =>
  useMemo<AuditGridRow[]>(
    () =>
      items.map((item) => ({
        createdAt: item.createdAt,
        id: item.storageKey,
        playerId: item.playerId ?? 'n/a',
        providerId: item.providerId ?? 'n/a',
        status: item.status,
        templateLabel: item.templateId
          ? PROMPT_TEMPLATE_DESCRIPTORS[item.templateId].label
          : item.nodeId ?? 'Unknown',
      })),
    [items]
  );

const useQueueColumns = (onOpenReview: (storageKey: string) => void) =>
  useMemo<Array<GridColDef<AuditGridRow>>>(
    () => [
      { field: 'templateLabel', flex: 1.5, headerName: 'Template / Node' },
      { field: 'playerId', flex: 1, headerName: 'Player' },
      { field: 'providerId', flex: 1, headerName: 'Provider' },
      {
        field: 'status',
        headerName: 'Status',
        renderCell: (params) => (
          <span className={`audit-chip status-${params.row.status}`}>
            {STATUS_LABELS[params.row.status]}
          </span>
        ),
        width: 140,
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        renderCell: (params: GridRenderCellParams<AuditGridRow>) => (
          <span>{formatDate(params?.row?.createdAt)}</span>
        ),
        width: 200,
      },
      {
        field: 'actions',
        filterable: false,
        headerName: 'Review',
        renderCell: (params: GridRenderCellParams<AuditGridRow>) => (
          <button type="button" className="audit-grid-link" onClick={() => onOpenReview(params.row.id)}>
            Open Review
          </button>
        ),
        sortable: false,
        width: 160,
      },
    ],
    [onOpenReview]
  );

type AuditQueueTableProps = {
  columns: Array<GridColDef<AuditGridRow>>;
  rows: AuditGridRow[];
  isLoading: boolean;
};

const AuditQueueTable = ({ columns, isLoading, rows }: AuditQueueTableProps) => (
  <div className="audit-grid-wrapper">
    <DataGrid
      rows={rows}
      columns={columns}
      autoHeight
      disableColumnFilter
      disableDensitySelector
      hideFooterSelectedRowCount
      loading={isLoading}
      paginationModel={{ page: 0, pageSize: 25 }}
      pageSizeOptions={[25]}
    />
  </div>
);
