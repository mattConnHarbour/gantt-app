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

// Generate a unique ID for custom (non-Linear) items
function generateCustomId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function App() {
  const { user, isLoading: authLoading, canEdit } = useAuth();
  const { tickets, loading, error, addTicket, updateTicket, removeTicket } = useTickets();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [dayViewDate, setDayViewDate] = useState<Date | null>(null);
  const [customerFilter, setCustomerFilter] = useState<string>('');

  // Extract unique customers from tickets
  const customers = [...new Set(tickets.map(t => t.customer).filter(Boolean))] as string[];

  const handleDayViewToggle = () => {
    setDayViewDate(dayViewDate ? null : new Date());
  };

  const handleDayViewPrev = () => {
    if (dayViewDate) {
      const prev = new Date(dayViewDate);
      prev.setDate(prev.getDate() - 1);
      setDayViewDate(prev);
    }
  };

  const handleDayViewNext = () => {
    if (dayViewDate) {
      const next = new Date(dayViewDate);
      next.setDate(next.getDate() + 1);
      setDayViewDate(next);
    }
  };

  // Filter tickets by customer and day view
  const filteredTickets = tickets.filter(ticket => {
    // Customer filter
    if (customerFilter && ticket.customer !== customerFilter) {
      return false;
    }
    // Day view filter
    if (dayViewDate) {
      const start = new Date(ticket.startDate);
      const end = new Date(ticket.endDate);
      const dayStart = new Date(dayViewDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayViewDate);
      dayEnd.setHours(23, 59, 59, 999);
      return start <= dayEnd && end >= dayStart;
    }
    return true;
  });

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

  const handleAddLinearTicket = async (linearTicket: LinearTicket) => {
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today);
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

  const handleAddCustomItem = async (customer: string, title: string) => {
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    await addTicket({
      id: generateCustomId(),
      title,
      startDate,
      endDate: endDate.toISOString().split('T')[0],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      customer,
      isCustom: true,
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
      canEdit={canEdit}
      dayViewDate={dayViewDate}
      onDayViewToggle={handleDayViewToggle}
      onDayViewPrev={handleDayViewPrev}
      onDayViewNext={handleDayViewNext}
      customers={customers}
      customerFilter={customerFilter}
      onCustomerFilterChange={setCustomerFilter}
      sidebar={
        <TicketList
          tickets={tickets}
          onDelete={canEdit ? removeTicket : undefined}
          onAdd={canEdit ? handleAddLinearTicket : undefined}
          onAddCustom={canEdit ? handleAddCustomItem : undefined}
          onSelect={handleSelect}
          selectedId={selectedId}
          canEdit={canEdit}
        />
      }
      main={
        <GanttChart
          tickets={filteredTickets}
          onUpdate={canEdit ? updateTicket : undefined}
          onDropLinearTicket={canEdit ? handleDropLinearTicket : undefined}
          selectedId={selectedId}
          onSelect={handleSelect}
          canEdit={canEdit}
          dayViewDate={dayViewDate}
        />
      }
    />
  );
}
