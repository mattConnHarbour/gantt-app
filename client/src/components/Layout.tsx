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
  sortByDueDate?: boolean;
  onSortByDueDateToggle?: () => void;
}

export function Layout({
  main,
  hasSelection,
  onRemove,
  canEdit,
  onAddCustom,
  viewMode = 'gantt',
  sortByDueDate = false,
  onSortByDueDateToggle,
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
