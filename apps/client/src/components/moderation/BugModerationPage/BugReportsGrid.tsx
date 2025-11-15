import type { BugReport, BugReportStatus } from '@glass-frontier/dto';
import { BUG_REPORT_STATUSES } from '@glass-frontier/dto';
import { Chip, TextField } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRowClassNameParams,
  type GridRowParams,
} from '@mui/x-data-grid';
import React, { useMemo, useState } from 'react';

import type { BugModerationFilters } from '../../../stores/bugModerationStore';
import { formatBugStatus } from './statusLabels';

type BugReportsGridProps = {
  filters: BugModerationFilters;
  isLoading: boolean;
  onFilterChange: (updates: Partial<BugModerationFilters>) => void;
  onSelectReport: (reportId: string) => void;
  reports: BugReport[];
  selectedReportId: string | null;
};

type GridRow = {
  characterId: string;
  chronicleId: string;
  createdAt: string;
  createdAtLabel: string;
  id: string;
  loginId: string;
  playerId: string;
  status: BugReportStatus;
  summary: string;
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const normalizeField = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value;
};

const createRow = (report: BugReport): GridRow => ({
  characterId: normalizeField(report.characterId),
  chronicleId: normalizeField(report.chronicleId),
  createdAt: report.createdAt,
  createdAtLabel: formatTimestamp(report.createdAt),
  id: report.id,
  loginId: report.loginId,
  playerId: normalizeField(report.playerId),
  status: report.status,
  summary: report.summary,
});

const filterReports = (
  reports: BugReport[],
  filters: BugModerationFilters
): GridRow[] => {
  const query = filters.query.trim().toLowerCase();
  const statusSet = new Set(filters.statuses);
  return reports
    .filter((report) => {
      const matchesStatus = statusSet.size === 0 || statusSet.has(report.status);
      if (!matchesStatus) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystacks = [
        report.summary,
        report.details,
        report.loginId,
        report.playerId ?? '',
        report.chronicleId ?? '',
        report.characterId ?? '',
        report.adminNotes ?? '',
      ];
      return haystacks.some((text) => text.toLowerCase().includes(query));
    })
    .map(createRow)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

const useColumns = (): Array<GridColDef<GridRow>> =>
  useMemo(
    () => [
      { field: 'summary', flex: 1.6, headerName: 'Summary', minWidth: 220 },
      {
        field: 'status',
        headerName: 'Status',
        minWidth: 140,
        valueFormatter: (params) => formatBugStatus(params.value as BugReportStatus),
      },
      { field: 'loginId', headerName: 'Login', minWidth: 160 },
      {
        field: 'chronicleId',
        headerName: 'Chronicle',
        minWidth: 220,
        valueFormatter: (params) => (params.value ? String(params.value) : '—'),
      },
      {
        field: 'createdAtLabel',
        headerName: 'Created',
        minWidth: 210,
      },
    ],
    []
  );

export const BugReportsGrid = ({
  filters,
  isLoading,
  onFilterChange,
  onSelectReport,
  reports,
  selectedReportId,
}: BugReportsGridProps) => {
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });
  const columns = useColumns();
  const rows = useMemo(() => filterReports(reports, filters), [filters, reports]);

  const handleToggleStatus = (status: BugReportStatus) => {
    const isActive = filters.statuses.includes(status);
    const nextStatuses = isActive
      ? filters.statuses.filter((value) => value !== status)
      : [...filters.statuses, status];
    onFilterChange({ statuses: nextStatuses });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ query: event.target.value });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const handleRowClick = (params: GridRowParams) => {
    onSelectReport(String(params.id));
  };

  return (
    <section className="bug-grid-card">
      <div className="bug-filter-row">
        <TextField
          label="Search bug reports"
          placeholder="Search by summary, login, or ID"
          size="small"
          value={filters.query}
          onChange={handleQueryChange}
        />
        <div className="bug-filter-statuses">
          {BUG_REPORT_STATUSES.map((status) => {
            const active = filters.statuses.includes(status);
            return (
              <Chip
                key={status}
                clickable
                color={active ? 'primary' : 'default'}
                label={formatBugStatus(status)}
                onClick={() => handleToggleStatus(status)}
                size="small"
                variant={active ? 'filled' : 'outlined'}
              />
            );
          })}
        </div>
      </div>
      <div className="bug-grid-wrapper">
        <DataGrid
          autoHeight={false}
          checkboxSelection={false}
          className="bug-grid"
          columns={columns}
          density="compact"
          disableColumnMenu
          disableRowSelectionOnClick
          getRowClassName={(params: GridRowClassNameParams) =>
            params.id === selectedReportId ? 'bug-grid-row--selected' : ''
          }
          loading={isLoading}
          onPaginationModelChange={setPaginationModel}
          onRowClick={handleRowClick}
          paginationModel={paginationModel}
          pageSizeOptions={[25, 50, 100]}
          rows={rows}
          rowSelection={false}
        />
      </div>
    </section>
  );
};
