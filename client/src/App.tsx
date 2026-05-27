import { useState } from 'react';
import { Layout } from './components/Layout';
import { TicketList } from './components/TicketList';
import { GanttChart } from './components/GanttChart';
import { useTickets } from './hooks/useTickets';
import type { GanttTicket, LinearTicket } from './types';
import './App.css';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export function App() {
  const { tickets, loading, error, addTicket, updateTicket, removeTicket } = useTickets();
  const [selectedId, setSelectedId] = useState<string | undefined>();

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
      onRemove={handleRemoveSelected}
      sidebar={
        <TicketList
          tickets={tickets}
          onDelete={removeTicket}
          onSelect={handleSelect}
          selectedId={selectedId}
        />
      }
      main={
        <GanttChart
          tickets={tickets}
          onUpdate={updateTicket}
          onDropLinearTicket={handleDropLinearTicket}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      }
    />
  );
}
