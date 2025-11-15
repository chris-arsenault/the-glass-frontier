import type { LocationPlace } from '@glass-frontier/dto';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import type { FormEvent } from 'react';
import React, { useState } from 'react';

import { decodeTags } from './locationUtils';

type CreateChildDialogProps = {
  isCreating: boolean;
  onClose: () => void;
  onCreate: (input: {
    description?: string;
    kind: string;
    name: string;
    tags: string[];
  }) => Promise<void>;
  open: boolean;
  parent: LocationPlace | null;
};

export const CreateChildDialog = ({
  isCreating,
  onClose,
  onCreate,
  open,
  parent,
}: CreateChildDialogProps) => {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('locale');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  const resetForm = () => {
    setName('');
    setKind('locale');
    setDescription('');
    setTags('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    await onCreate({
      description: description.trim() || undefined,
      kind: kind.trim() || 'locale',
      name: name.trim(),
      tags: decodeTags(tags),
    });
    resetForm();
  };

  const handleDialogClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleDialogClose} fullWidth maxWidth="sm">
      <DialogTitle>Add sub-location</DialogTitle>
      <DialogContent>
        <p className="lm-dialog-meta">
          {parent ? `Parent: ${parent.name}` : 'Select a location from the grid to add a child.'}
        </p>
        <form className="lm-child-form" onSubmit={handleSubmit}>
          <div className="lm-field-grid">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Type
              <input value={kind} onChange={(event) => setKind(event.target.value)} />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            Tags
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          <DialogActions>
            <Button onClick={handleDialogClose} type="button">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={isCreating || !parent || !name.trim()}>
              {isCreating ? 'Creating…' : 'Add sub-location'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
};
