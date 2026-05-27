import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  selectedTicketUrl?: string;
  onRemove?: () => void;
  canEdit?: boolean;
}

export function Layout({ sidebar, main, selectedTicketUrl, onRemove, canEdit }: Props) {
  const [showSidebar, setShowSidebar] = useState(true);
  const { user, signOut } = useAuth();
  const hasSelection = !!selectedTicketUrl;

  return (
    <div className="layout">
      <header className="header">
        <button className="menu-toggle" onClick={() => setShowSidebar(!showSidebar)}>
          {showSidebar ? '←' : '☰'}
        </button>
        <h1>Gantt Chart</h1>
        <div className="header-actions">
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
