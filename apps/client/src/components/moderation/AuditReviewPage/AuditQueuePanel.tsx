import type { AuditQueueItem, AuditReviewStatus } from '@glass-frontier/dto';
import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import React, { useMemo, useState } from 'react';

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
  isGroup: boolean;
  groupId?: string;
  itemCount?: number;
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const { rows, allRows } = useQueueRows(items, expandedGroups);
  const columns = useQueueColumns(onOpenReview, toggleGroup, expandedGroups);

  return (
    <section className="audit-panel audit-queue-panel">
      <div className="audit-panel-header">
        <h2>Review Queue</h2>
        <span className="audit-count">{allRows.length} items</span>
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

const useQueueRows = (items: AuditQueueItem[], expandedGroups: Set<string>) =>
  useMemo<{ rows: AuditGridRow[]; allRows: AuditGridRow[] }>(() => {
    // Group items by groupId
    const groups = new Map<string, AuditQueueItem[]>();
    for (const item of items) {
      const existing = groups.get(item.groupId) ?? [];
      existing.push(item);
      groups.set(item.groupId, existing);
    }

    const allRows: AuditGridRow[] = [];
    const visibleRows: AuditGridRow[] = [];

    // Create rows for each group
    for (const [groupId, groupItems] of groups.entries()) {
      // Find the most recent status among items in the group
      const hasCompleted = groupItems.some(item => item.status === 'completed');
      const hasInProgress = groupItems.some(item => item.status === 'in_progress');
      const groupStatus: AuditReviewStatus = hasCompleted ? 'completed' : hasInProgress ? 'in_progress' : 'unreviewed';

      // Find earliest created time
      const earliestItem = groupItems.reduce((earliest, current) =>
        current.createdAtMs < earliest.createdAtMs ? current : earliest
      );

      // Create a better label for the turn
      const turnLabel = earliestItem.turnSequence !== null && earliestItem.turnSequence !== undefined
        ? `Turn #${earliestItem.turnSequence + 1}`
        : `Turn ${groupId.slice(0, 8)}`;

      // Add group row
      const groupRow: AuditGridRow = {
        createdAt: earliestItem.createdAt,
        groupId,
        id: groupId,
        isGroup: true,
        itemCount: groupItems.length,
        playerId: earliestItem.playerId ?? 'n/a',
        providerId: 'Turn Group',
        status: groupStatus,
        templateLabel: turnLabel,
      };

      allRows.push(groupRow);
      visibleRows.push(groupRow);

      // Add individual item rows as children - only if group is expanded
      const isExpanded = expandedGroups.has(groupId);
      for (const item of groupItems) {
        const childRow: AuditGridRow = {
          createdAt: item.createdAt,
          id: item.storageKey,
          isGroup: false,
          playerId: item.playerId ?? 'n/a',
          providerId: item.providerId ?? 'n/a',
          status: item.status,
          templateLabel: item.templateId
            ? PROMPT_TEMPLATE_DESCRIPTORS[item.templateId].label
            : item.nodeId ?? 'Unknown',
        };

        allRows.push(childRow);
        if (isExpanded) {
          visibleRows.push(childRow);
        }
      }
    }

    return { rows: visibleRows, allRows };
  }, [items, expandedGroups]);

const useQueueColumns = (
  onOpenReview: (storageKey: string) => void,
  toggleGroup: (groupId: string) => void,
  expandedGroups: Set<string>
) =>
  useMemo<Array<GridColDef<AuditGridRow>>>(
    () => [
      {
        field: 'templateLabel',
        flex: 1.5,
        headerName: 'Template / Node',
        renderCell: (params: GridRenderCellParams<AuditGridRow>) => {
          if (params.row.isGroup) {
            const isExpanded = expandedGroups.has(params.row.groupId!);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => toggleGroup(params.row.groupId!)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '18px',
                  }}
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
                <strong>{params.row.templateLabel} ({params.row.itemCount} items)</strong>
              </div>
            );
          }
          return <span style={{ marginLeft: '32px' }}>{params.row.templateLabel}</span>;
        },
      },
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
        renderCell: (params: GridRenderCellParams<AuditGridRow>) => {
          if (params.row.isGroup) {
            return null;
          }
          return (
            <button type="button" className="audit-grid-link" onClick={() => onOpenReview(params.row.id)}>
              Open Review
            </button>
          );
        },
        sortable: false,
        width: 160,
      },
    ],
    [onOpenReview, toggleGroup, expandedGroups]
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
