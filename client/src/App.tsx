import { useState } from 'react';
import { Layout } from './components/Layout';
import { TicketList } from './components/TicketList';
import { GanttChart } from './components/GanttChart';
import { SignIn } from './components/SignIn';
import { useTickets } from './hooks/useTickets';
import { useAuth } from './contexts/AuthContext';
import type { GanttTicket, LinearTicket } from './types';
import './App.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function App() {
  const { user, isLoading: authLoading, canEdit } = useAuth();
  const { tickets, loading, error, addTicket, updateTicket, removeTicket } = useTickets();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  if (authLoading) {
    return (
      <div className="loading">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  const handleSelect = (ticket: GanttTicket) => {
    setSelectedId(ticket.id === selectedId ? undefined : ticket.id);
  };

  const selectedTicket = tickets.find(t => t.id === selectedId);

  const handleRemoveSelected = async () => {
    if (selectedId) {
      await removeTicket(selectedId);
      setSelectedId(undefined);
    }
  };

  const shiftDate = (dateStr: string, days: number): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  };

  const handleMoveLeft = async () => {
    if (selectedTicket) {
      await updateTicket(selectedTicket.id, {
        startDate: shiftDate(selectedTicket.startDate, -1),
        endDate: shiftDate(selectedTicket.endDate, -1),
      });
    }
  };

  const handleMoveRight = async () => {
    if (selectedTicket) {
      await updateTicket(selectedTicket.id, {
        startDate: shiftDate(selectedTicket.startDate, 1),
        endDate: shiftDate(selectedTicket.endDate, 1),
      });
    }
  };

  const handleExtendLeft = async () => {
    if (selectedTicket) {
      await updateTicket(selectedTicket.id, {
        startDate: shiftDate(selectedTicket.startDate, -1),
      });
    }
  };

  const handleExtendRight = async () => {
    if (selectedTicket) {
      await updateTicket(selectedTicket.id, {
        endDate: shiftDate(selectedTicket.endDate, 1),
      });
    }
  };

  const handleDropLinearTicket = async (linearTicket: LinearTicket, startDate: string) => {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    await addTicket({
      id: linearTicket.identifier,
      title: linearTicket.title,
      description: linearTicket.description,
      startDate,
      endDate: endDate.toISOString().split('T')[0],
      linearUrl: linearTicket.url,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      customer: linearTicket.customer,
    });
  };

  if (loading) {
    return (
      <div className="loading">
        <p>Loading tickets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <p>Error: {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <Layout
      selectedTicketUrl={selectedTicket?.linearUrl}
      hasSelection={!!selectedTicket}
      onRemove={canEdit ? handleRemoveSelected : undefined}
      onMoveLeft={canEdit ? handleMoveLeft : undefined}
      onMoveRight={canEdit ? handleMoveRight : undefined}
      onExtendLeft={canEdit ? handleExtendLeft : undefined}
      onExtendRight={canEdit ? handleExtendRight : undefined}
      canEdit={canEdit}
      sidebar={
        <TicketList
          tickets={tickets}
          onDelete={canEdit ? removeTicket : undefined}
          onSelect={handleSelect}
          selectedId={selectedId}
          canEdit={canEdit}
        />
      }
      main={
        <GanttChart
          tickets={tickets}
          onUpdate={canEdit ? updateTicket : undefined}
          onDropLinearTicket={canEdit ? handleDropLinearTicket : undefined}
          selectedId={selectedId}
          onSelect={handleSelect}
          canEdit={canEdit}
        />
      }
    />
  );
}
