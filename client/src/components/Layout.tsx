import { useState } from 'react';

interface Props {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  selectedTicketUrl?: string;
  onRemove?: () => void;
}

export function Layout({ sidebar, main, selectedTicketUrl, onRemove }: Props) {
  const [showSidebar, setShowSidebar] = useState(true);
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
          <button
            className="header-btn header-btn-danger"
            disabled={!hasSelection}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </header>
      <div className="layout-body">
        <aside className={`sidebar ${showSidebar ? 'open' : ''}`}>{sidebar}</aside>
        <main className="main">{main}</main>
      </div>
    </div>
  );
}
