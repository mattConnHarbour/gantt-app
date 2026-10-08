import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CustomerInput } from './CustomerInput';

interface Props {
  main: React.ReactNode;
  selectedTicketUrl?: string;
  hasSelection?: boolean;
  onRemove?: () => void;
  canEdit?: boolean;
  dayViewDate?: Date | null;
  onDayViewToggle?: () => void;
  onDayViewPrev?: () => void;
  onDayViewNext?: () => void;
  customers?: string[];
  customerFilter?: string;
  onCustomerFilterChange?: (customer: string) => void;
  onAddCustom?: (customer: string, title: string, pylonTicketId?: string) => Promise<void>;
  viewMode?: 'gantt' | 'dueDate';
  sortByDueDate?: boolean;
  onSortByDueDateToggle?: () => void;
}

export function Layout({
  main,
  hasSelection,
  onRemove,
  canEdit,
  customers = [],
  onAddCustom,
  viewMode = 'gantt',
  sortByDueDate = false,
  onSortByDueDateToggle,
}: Props) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [customCustomer, setCustomCustomer] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [pylonTicketId, setPylonTicketId] = useState('');
  const pylonIdValid = !pylonTicketId.trim() || /^[0-9]+$/.test(pylonTicketId.trim());
  const [isAdding, setIsAdding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, signOut } = useAuth();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAddDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddCustom = async () => {
    if (!customCustomer.trim() || !customTitle.trim() || !pylonIdValid || !onAddCustom || isAdding) return;
    setIsAdding(true);
    try {
      await onAddCustom(customCustomer.trim(), customTitle.trim(), pylonTicketId.trim());
      setCustomCustomer('');
      setCustomTitle('');
      setPylonTicketId('');
      setShowAddDropdown(false);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>In-flight Planner</h1>
        <div className="header-actions">
          {canEdit && (
            <button
              className="header-btn header-btn-danger"
              disabled={!hasSelection}
              onClick={onRemove}
            >
              Remove
            </button>
          )}
          <div className="header-separator" />
          {viewMode === 'gantt' && (
            <button
              className={`header-btn due-date-btn ${sortByDueDate ? 'active' : ''}`}
              onClick={onSortByDueDateToggle}
              aria-pressed={sortByDueDate}
            >
              Sort
            </button>
          )}
          {canEdit && onAddCustom && (
            <div className="add-item-dropdown" ref={dropdownRef}>
              <button
                className="header-btn add-item-btn"
                onClick={() => setShowAddDropdown(!showAddDropdown)}
              >
                + Add Item
              </button>
              {showAddDropdown && (
                <div className="add-item-menu">
                  <CustomerInput
                    customers={customers}
                    className="add-item-input"
                    placeholder="Customer"
                    aria-label="Customer"
                    value={customCustomer}
                    onChange={setCustomCustomer}
                    autoFocus
                  />
                  <input
                    type="text"
                    className="add-item-input"
                    placeholder="Title"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    className="add-item-input"
                    placeholder="Pylon ticket ID (optional)"
                    aria-label="Pylon ticket ID (optional)"
                    value={pylonTicketId}
                    onChange={(event) => setPylonTicketId(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleAddCustom()}
                    aria-invalid={!pylonIdValid}
                  />
                  {!pylonIdValid && <p className="pylon-id-error" role="alert">Enter a numeric Pylon ticket ID.</p>}
                  <button
                    className="add-item-submit"
                    onClick={handleAddCustom}
                    disabled={isAdding || !customCustomer.trim() || !customTitle.trim() || !pylonIdValid}
                  >
                    {isAdding ? 'Adding...' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="header-user">
          {user && (
            <>
              <img src={user.picture} alt={user.name} className="user-avatar" />
              <button className="header-btn" onClick={signOut}>Sign Out</button>
            </>
          )}
        </div>
      </header>
      <div className="layout-body">
        <main className="main">{main}</main>
      </div>
    </div>
  );
}
