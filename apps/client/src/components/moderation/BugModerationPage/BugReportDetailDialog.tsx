import type { BugReport, BugReportStatus } from '@glass-frontier/dto';
import { BUG_REPORT_STATUSES } from '@glass-frontier/dto';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';

import { formatBugStatus } from './statusLabels';

type DetailDialogProps = {
  error: string | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: {
    adminNotes: string | null;
    backlogItem: string | null;
    status: BugReportStatus;
  }) => Promise<void> | void;
  report: BugReport | null;
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const describeField = (value?: string | null): string => {
  if (!value) {
    return '—';
  }
  return value;
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

export function BugReportDetailDialog({
  error,
  isOpen,
  isSaving,
  onClose,
  onSave,
  report,
}: DetailDialogProps) {
  const [status, setStatus] = useState<BugReportStatus>('open');
  const [adminNotes, setAdminNotes] = useState('');
  const [backlogItem, setBacklogItem] = useState('');

  useEffect(() => {
    if (!report) {
      setStatus('open');
      setAdminNotes('');
      setBacklogItem('');
      return;
    }
    setStatus(report.status);
    setAdminNotes(report.adminNotes ?? '');
    setBacklogItem(report.backlogItem ?? '');
  }, [report]);

  const canSave = Boolean(report) && !isSaving;

  const metadataPreview = useMemo(() => {
    if (!report?.metadata) {
      return null;
    }
    try {
      return JSON.stringify(report.metadata, null, 2);
    } catch (error) {
      return String(error);
    }
  }, [report]);

  const handleSave = async () => {
    if (!report) {
      return;
    }
    await onSave({
      adminNotes: toNullable(adminNotes),
      backlogItem: toNullable(backlogItem),
      status,
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Bug report details</DialogTitle>
      <DialogContent dividers className="bug-detail-dialog">
        {report ? (
          <>
            <div className="bug-detail-header">
              <div>
                <p className="bug-detail-overline">Summary</p>
                <h2 className="bug-detail-title">{report.summary}</h2>
                <p className="bug-detail-meta">ID: {report.id}</p>
              </div>
              <div className="bug-detail-context">
                <dl>
                  <dt>Status</dt>
                  <dd>{formatBugStatus(report.status)}</dd>
                </dl>
                <dl>
                  <dt>Login</dt>
                  <dd>{report.loginId}</dd>
                </dl>
                <dl>
                  <dt>Player</dt>
                  <dd>{describeField(report.playerId)}</dd>
                </dl>
                <dl>
                  <dt>Chronicle</dt>
                  <dd>{describeField(report.chronicleId)}</dd>
                </dl>
                <dl>
                  <dt>Character</dt>
                  <dd>{describeField(report.characterId)}</dd>
                </dl>
                <dl>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(report.createdAt)}</dd>
                </dl>
                <dl>
                  <dt>Updated</dt>
                  <dd>{formatTimestamp(report.updatedAt)}</dd>
                </dl>
              </div>
            </div>
            <section className="bug-detail-section">
              <p className="bug-detail-overline">Player details</p>
              <pre className="bug-detail-body">{report.details}</pre>
            </section>
            <section className="bug-detail-section">
              <div className="bug-detail-form-grid">
                <TextField
                  label="Status"
                  select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as BugReportStatus)}
                  fullWidth
                >
                  {BUG_REPORT_STATUSES.map((option) => (
                    <MenuItem key={option} value={option}>
                      {formatBugStatus(option)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Backlog Item"
                  value={backlogItem}
                  onChange={(event) => setBacklogItem(event.target.value)}
                  inputProps={{ maxLength: 240 }}
                  helperText="Short label for backlog tracking"
                  fullWidth
                />
              </div>
              <TextField
                label="Admin Notes"
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                multiline
                minRows={4}
                fullWidth
                helperText="Internal notes for the moderation team"
              />
            </section>
            {metadataPreview ? (
              <section className="bug-detail-section">
                <p className="bug-detail-overline">Metadata</p>
                <pre className="bug-detail-metadata">{metadataPreview}</pre>
              </section>
            ) : null}
          </>
        ) : (
          <p>Select a bug report to see the full details.</p>
        )}
        {error ? (
          <p className="bug-detail-error" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button onClick={handleSave} disabled={!canSave} variant="contained">
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
