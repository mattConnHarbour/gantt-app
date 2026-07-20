import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

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
  onAddCustom?: (customer: string, title: string) => Promise<void>;
  viewMode?: 'gantt' | 'dueDate';
  onDueDateToggle?: () => void;
}

export function Layout({
  main,
  selectedTicketUrl,
  hasSelection,
  onRemove,
  canEdit,
  dayViewDate,
  onDayViewToggle,
  onDayViewPrev,
  onDayViewNext,
  customers = [],
  customerFilter = '',
  onCustomerFilterChange,
  onAddCustom,
  viewMode = 'gantt',
  onDueDateToggle
}: Props) {
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [customCustomer, setCustomCustomer] = useState('');
  const [customTitle, setCustomTitle] = useState('');
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
    if (!customCustomer.trim() || !customTitle.trim() || !onAddCustom) return;
    setIsAdding(true);
    try {
      await onAddCustom(customCustomer.trim(), customTitle.trim());
      setCustomCustomer('');
      setCustomTitle('');
      setShowAddDropdown(false);
    } finally {
      setIsAdding(false);
    }
  };

  const dayLabel = dayViewDate
    ? dayViewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : 'Day View';

  return (
    <div className="layout">
      <header className="header">
        <h1>Gantt Chart</h1>
        <div className="header-actions">
          <button
            className="header-btn"
            disabled={!hasSelection || !selectedTicketUrl}
            onClick={() => selectedTicketUrl && window.open(selectedTicketUrl, '_blank')}
            title={!selectedTicketUrl && hasSelection ? 'No Linear link' : 'Open in Linear'}
          >
            Open
          </button>
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
          {customers.length > 0 && (
            <select
              className="customer-filter"
              value={customerFilter}
              onChange={(e) => onCustomerFilterChange?.(e.target.value)}
            >
              <option value="">All Customers</option>
              {customers.map((customer) => (
                <option key={customer} value={customer}>
                  {customer}
                </option>
              ))}
            </select>
          )}
          <div className="day-view-controls">
            {dayViewDate && (
              <button className="day-nav-btn" onClick={onDayViewPrev}>
                &lt;
              </button>
            )}
            <button
              className={`day-view-btn ${dayViewDate ? 'active' : ''}`}
              onClick={onDayViewToggle}
            >
              {dayLabel}
            </button>
            {dayViewDate && (
              <button className="day-nav-btn" onClick={onDayViewNext}>
                &gt;
              </button>
            )}
          </div>
          <button
            className={`header-btn due-date-btn ${viewMode === 'dueDate' ? 'active' : ''}`}
            onClick={onDueDateToggle}
          >
            Due Dates
          </button>
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
                  <input
                    type="text"
                    className="add-item-input"
                    placeholder="Customer"
                    value={customCustomer}
                    onChange={(e) => setCustomCustomer(e.target.value)}
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
                  <button
                    className="add-item-submit"
                    onClick={handleAddCustom}
                    disabled={isAdding || !customCustomer.trim() || !customTitle.trim()}
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
