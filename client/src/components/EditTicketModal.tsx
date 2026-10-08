import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { GanttTicket } from '../types';
import { CustomerInput } from './CustomerInput';

interface Props {
  ticket: GanttTicket;
  customers: string[];
  onSave: (id: string, updates: { customer: string; title: string; pylonTicketId: string }) => Promise<unknown>;
  onClose: () => void;
}

export function EditTicketModal({ ticket, customers, onSave, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [customer, setCustomer] = useState(ticket.customer ?? '');
  const [title, setTitle] = useState(ticket.title);
  const [pylonTicketId, setPylonTicketId] = useState(ticket.pylonTicketId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!title.trim()) {
      setError('Please enter a deliverable.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(ticket.id, { customer: customer.trim(), title: title.trim(), pylonTicketId: pylonTicketId.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="edit-ticket-modal"
      aria-labelledby="edit-ticket-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!savingRef.current) onClose();
      }}
    >
      <form onSubmit={handleSubmit} aria-busy={saving}>
        <h2 id="edit-ticket-title">Edit ticket</h2>
        <div className="edit-ticket-fields">
          <label htmlFor="edit-ticket-customer">Customer</label>
          <CustomerInput
            id="edit-ticket-customer"
            customers={customers}
            value={customer}
            onChange={setCustomer}
            disabled={saving}
            autoFocus
          />
          <label htmlFor="edit-ticket-bar-text">Deliverable</label>
          <input
            id="edit-ticket-bar-text"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={saving}
            required
          />
          <label htmlFor="edit-ticket-pylon">Pylon ticket ID (optional)</label>
          <input
            id="edit-ticket-pylon"
            type="text"
            inputMode="numeric"
            pattern="\s*[0-9]+\s*"
            title="Enter a numeric Pylon ticket ID, such as 520"
            placeholder="520"
            value={pylonTicketId}
            onChange={(event) => setPylonTicketId(event.target.value)}
            disabled={saving}
          />
        </div>
        {error && <p className="edit-ticket-error" role="alert">{error}</p>}
        <div className="date-change-actions">
          <button type="button" className="header-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="date-change-confirm" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
