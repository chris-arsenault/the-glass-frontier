import type { LocationPlace } from '@glass-frontier/dto';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import React from 'react';

type DescriptionDialogProps = {
  description: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  place: LocationPlace | null;
};

export const DescriptionDialog = ({
  description,
  isSaving,
  onChange,
  onClose,
  onSave,
  open,
  place,
}: DescriptionDialogProps) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit description</DialogTitle>
      <DialogContent className="lm-dialog-content">
        <p className="lm-dialog-meta">
          {place ? `Location: ${place.name}` : 'Select a location from the grid.'}
        </p>
        <textarea
          className="lm-dialog-textarea"
          rows={5}
          value={description}
          onChange={(event) => onChange(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} variant="contained" disabled={isSaving || !place}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
