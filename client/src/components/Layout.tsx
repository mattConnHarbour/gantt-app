import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  selectedTicketUrl?: string;
  hasSelection?: boolean;
  onRemove?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onShrinkLeft?: () => void;
  onExtendLeft?: () => void;
  onShrinkRight?: () => void;
  onExtendRight?: () => void;
  canEdit?: boolean;
}

export function Layout({
  sidebar,
  main,
  selectedTicketUrl,
  hasSelection,
  onRemove,
  onMoveLeft,
  onMoveRight,
  onShrinkLeft,
  onExtendLeft,
  onShrinkRight,
  onExtendRight,
  canEdit
}: Props) {
  const [showSidebar, setShowSidebar] = useState(true);
  const { user, signOut } = useAuth();

  return (
    <div className="layout">
      <header className="header">
        <button className="menu-toggle" onClick={() => setShowSidebar(!showSidebar)}>
          {showSidebar ? '←' : '☰'}
        </button>
        <h1>Gantt Chart</h1>
        <div className="header-actions">
          {canEdit && (
            <>
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onMoveLeft}
                title="Move left"
              >
                ◀
              </button>
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onMoveRight}
                title="Move right"
              >
                ▶
              </button>
              <span className="header-separator" />
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onExtendLeft}
                title="Extend left (start earlier)"
              >
                ⇤
              </button>
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onShrinkLeft}
                title="Shrink left (start later)"
              >
                ⇥
              </button>
              <span className="header-separator" />
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onShrinkRight}
                title="Shrink right (end earlier)"
              >
                ⇤
              </button>
              <button
                className="header-btn"
                disabled={!hasSelection}
                onClick={onExtendRight}
                title="Extend right (end later)"
              >
                ⇥
              </button>
            </>
          )}
          <button
            className="header-btn"
            disabled={!hasSelection}
            onClick={() => selectedTicketUrl && window.open(selectedTicketUrl, '_blank')}
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
        <aside className={`sidebar ${showSidebar ? 'open' : ''}`}>{sidebar}</aside>
        <main className="main">{main}</main>
      </div>
    </div>
  );
}
