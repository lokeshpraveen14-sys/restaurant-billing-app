import React, { useState } from 'react';
import { useTableStore } from '../store/tableStore';
import { useOrderStore } from '../store/orderStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../store/uiStore';
import { Table, Plus, Users, GitMerge, ArrowsSplit } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { TableStatus } from '../types';

const STATUS_LABELS: Record<TableStatus, string> = {
  free: 'Free', occupied: 'Occupied', reserved: 'Reserved', billing: 'Billing', cleaning: 'Cleaning',
};

function formatElapsed(since: Date | undefined): string {
  if (!since) return '';
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function TableManagement() {
  const { tables, getTablesBySection, updateTableStatus, addTable } = useTableStore();
  const { getOrderByTable } = useOrderStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('All');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTable, setNewTable] = useState({
    number: '',
    capacity: '4',
    section: 'Main Hall',
  });

  const [actionModal, setActionModal] = useState<{ type: 'free' | 'reserved'; tableId: string; tableNumber: string } | null>(null);
  const [guestsCount, setGuestsCount] = useState('');
  const [reservationDetails, setReservationDetails] = useState('');
  const [actionMode, setActionMode] = useState<'seat' | 'reserve' | 'edit'>('seat');
  const [editTableData, setEditTableData] = useState({ number: '', capacity: '4', section: '', extraChargePerPerson: '' });

  const handleAddTable = () => {
    if (!newTable.number) {
      toast.error('Missing field', 'Table number is required');
      return;
    }
    
    addTable({
      number: newTable.number,
      capacity: parseInt(newTable.capacity),
      section: newTable.section,
    });
    
    toast.success('Table Added', `Table ${newTable.number} added to ${newTable.section}`);
    setIsAddModalOpen(false);
    setNewTable({ number: '', capacity: '4', section: 'Main Hall' });
  };

  const sections = ['All', ...Object.keys(getTablesBySection())];

  const displayTables = activeSection === 'All'
    ? tables
    : tables.filter((t) => t.section === activeSection);

  const statusCounts = {
    free: tables.filter((t) => t.status === 'free').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
    billing: tables.filter((t) => t.status === 'billing').length,
    cleaning: tables.filter((t) => t.status === 'cleaning').length,
  };

  const handleTableClick = (tableId: string, status: TableStatus) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    if (status === 'free') {
      setActionModal({ type: 'free', tableId, tableNumber: table.number });
      setActionMode('seat');
      setGuestsCount('');
      setReservationDetails('');
      setEditTableData({
        number: table.number,
        capacity: table.capacity.toString(),
        section: table.section,
        extraChargePerPerson: table.extraChargePerPerson?.toString() || ''
      });
    } else if (status === 'occupied' || status === 'billing') {
      navigate(`/order?table=${tableId}`);
    } else if (status === 'reserved') {
      setActionModal({ type: 'reserved', tableId, tableNumber: table.number });
      setActionMode('seat');
      setGuestsCount('');
    } else if (status === 'cleaning') {
      updateTableStatus(tableId, 'free');
      toast.success('Table Ready', 'Table marked as free');
    }
  };

  const handleActionSubmit = () => {
    if (!actionModal) return;

    if (actionMode === 'edit') {
      if (!editTableData.number || !editTableData.section) {
        toast.error('Missing details', 'Table number and section are required');
        return;
      }
      useTableStore.getState().updateTable(actionModal.tableId, {
        number: editTableData.number,
        capacity: parseInt(editTableData.capacity) || 4,
        section: editTableData.section,
        extraChargePerPerson: editTableData.extraChargePerPerson ? parseFloat(editTableData.extraChargePerPerson) : undefined
      });
      toast.success('Table Updated', `Table ${editTableData.number} updated successfully.`);
      setActionModal(null);
      return;
    }

    if (actionMode === 'reserve') {
      if (!reservationDetails) {
        toast.error('Missing details', 'Please enter a reservation name/time');
        return;
      }
      updateTableStatus(actionModal.tableId, 'reserved', { reservedFor: reservationDetails });
      toast.success('Table Reserved', `Table ${actionModal.tableNumber} has been reserved.`);
      setActionModal(null);
    } else {
      // Seat guests
      const covers = parseInt(guestsCount);
      if (isNaN(covers) || covers <= 0) {
        toast.error('Invalid guests', 'Please enter a valid guest count');
        return;
      }
      // Update table to occupied immediately
      updateTableStatus(actionModal.tableId, 'occupied');
      navigate(`/order?table=${actionModal.tableId}&guests=${covers}`);
    }
  };

  return (
    <>
      <TopBar
        title="Table Management"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={16} /> Add Table
          </button>
        }
      />
      <div className="page-body">
        {/* Status Summary */}
        <div className="grid grid-4" style={{ gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: `var(--status-${status})`, flexShrink: 0
              }} />
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{count}</div>
                <div style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{status}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Section Tabs */}
        <div className="scroll-tabs" style={{ marginBottom: 'var(--space-5)' }}>
          {sections.map((section) => (
            <button
              key={section}
              className={`scroll-tab ${activeSection === section ? 'active' : ''}`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
          {([['free', 'Free'], ['occupied', 'Occupied'], ['reserved', 'Reserved'], ['billing', 'Billing'], ['cleaning', 'Cleaning']] as const).map(([s, label]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: `var(--status-${s})` }} />
              {label}
            </div>
          ))}
        </div>

        {/* Floor Plan Grid */}
        <div className="grid grid-tables" style={{ gap: 'var(--space-4)' }}>
          {displayTables.map((table) => (
            <div
              key={table.id}
              className={`table-card ${table.status}`}
              onClick={() => handleTableClick(table.id, table.status)}
              title={`${table.number} — ${STATUS_LABELS[table.status]}${table.reservedFor ? ': ' + table.reservedFor : ''}`}
            >
              <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <span style={{
                  display: 'block', width: 8, height: 8, borderRadius: '50%',
                  background: `var(--status-${table.status})`,
                  boxShadow: `0 0 6px var(--status-${table.status})`,
                }} />
              </div>

              <Table size={24} style={{ color: `var(--status-${table.status})`, marginBottom: 6, opacity: 0.7 }} />
              <div className="table-number">{table.number}</div>
              <div className="table-capacity">
                <Users size={10} style={{ display: 'inline', marginRight: 3 }} />{table.capacity} seats
              </div>
              {table.occupiedSince && (
                <div className="table-timer" style={{ color: `var(--status-${table.status})` }}>
                  {formatElapsed(table.occupiedSince)}
                </div>
              )}
              {table.reservedFor && (
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'center', padding: '0 4px', lineHeight: 1.3 }}>
                  {table.reservedFor}
                </div>
              )}
              <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, textAlign: 'center' }}>
                <span className={`badge badge-${table.status}`} style={{ fontSize: '0.55rem', padding: '2px 6px' }}>
                  {STATUS_LABELS[table.status]}
                </span>
              </div>
            </div>
          ))}
        </div>


      </div>

      {isAddModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="card" style={{ width: 350, maxWidth: '90vw' }}>
            <div className="card-header">
              <div className="card-title">Add New Table</div>
            </div>
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Table Number / Name *</label>
                <input 
                  className="input" 
                  value={newTable.number} 
                  onChange={(e) => setNewTable({ ...newTable, number: e.target.value.toUpperCase() })}
                  placeholder="e.g. T9 or V1"
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Capacity (Seats)</label>
                <select 
                  className="input" 
                  value={newTable.capacity} 
                  onChange={(e) => setNewTable({ ...newTable, capacity: e.target.value })}
                >
                  <option value="2">2 Seats</option>
                  <option value="4">4 Seats</option>
                  <option value="6">6 Seats</option>
                  <option value="8">8 Seats</option>
                  <option value="10">10 Seats</option>
                  <option value="12">12 Seats</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Section (e.g. Main Hall, Garden) *</label>
                <input 
                  className="input" 
                  value={newTable.section} 
                  onChange={(e) => setNewTable({ ...newTable, section: e.target.value })}
                  placeholder="e.g. Balcony"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-2)' }}>
                <button className="btn btn-ghost" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddTable}>Save Table</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="card" style={{ width: 350, maxWidth: '90vw' }}>
            <div className="card-header">
              <div className="card-title">Table {actionModal.tableNumber}</div>
            </div>
            <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {actionModal.type === 'free' && (
                <div className="tabs" style={{ padding: 3, marginBottom: 'var(--space-2)' }}>
                  <button
                    className={`tab-item ${actionMode === 'seat' ? 'active' : ''}`}
                    onClick={() => setActionMode('seat')}
                    style={{ flex: 1, textAlign: 'center', padding: '6px 0' }}
                  >
                    Seat Guests
                  </button>
                  <button
                    className={`tab-item ${actionMode === 'reserve' ? 'active' : ''}`}
                    onClick={() => setActionMode('reserve')}
                    style={{ flex: 1, textAlign: 'center', padding: '6px 0' }}
                  >
                    Reserve Table
                  </button>
                  <button
                    className={`tab-item ${actionMode === 'edit' ? 'active' : ''}`}
                    onClick={() => setActionMode('edit')}
                    style={{ flex: 1, textAlign: 'center', padding: '6px 0' }}
                  >
                    Edit Table
                  </button>
                </div>
              )}

              {actionMode === 'seat' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Number of Guests (Covers) *</label>
                  <input 
                    className="input" 
                    type="number"
                    min="1"
                    value={guestsCount} 
                    onChange={(e) => setGuestsCount(e.target.value)}
                    placeholder="e.g. 4"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleActionSubmit()}
                  />
                </div>
              )}
              
              {actionMode === 'reserve' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Reservation Details *</label>
                  <input 
                    className="input" 
                    type="text"
                    value={reservationDetails} 
                    onChange={(e) => setReservationDetails(e.target.value)}
                    placeholder="e.g. Mehta Family - 8:00 PM"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleActionSubmit()}
                  />
                </div>
              )}
              
              {actionMode === 'edit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Table Number / Name *</label>
                    <input className="input" value={editTableData.number} onChange={(e) => setEditTableData({ ...editTableData, number: e.target.value.toUpperCase() })} />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Capacity</label>
                      <input className="input" type="number" value={editTableData.capacity} onChange={(e) => setEditTableData({ ...editTableData, capacity: e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Section *</label>
                      <input className="input" value={editTableData.section} onChange={(e) => setEditTableData({ ...editTableData, section: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Cover Charge / Person (₹)</label>
                    <input className="input" type="number" placeholder="Optional" value={editTableData.extraChargePerPerson} onChange={(e) => setEditTableData({ ...editTableData, extraChargePerPerson: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleActionSubmit()} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 'var(--space-2)' }}>
                <button className="btn btn-ghost" onClick={() => setActionModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleActionSubmit}>
                  {actionMode === 'seat' ? 'Create Order' : actionMode === 'edit' ? 'Save Changes' : 'Confirm Reservation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
