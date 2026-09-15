import React, { useState } from 'react';
import { useTableStore } from '../store/tableStore';
import { useOrderStore } from '../store/orderStore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../store/uiStore';
import { Table, Plus, Users, GitMerge, ArrowsSplit, MapTrifold, SquaresFour, PencilSimple } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { TableStatus, Table as TableType } from '../types';
import FloorPlanMap from '../components/tables/FloorPlanMap';

const STATUS_LABELS: Record<TableStatus, string> = {
  free: 'Free', occupied: 'Occupied', reserved: 'Reserved', billing: 'Billing', cleaning: 'Cleaning', merged: 'Merged',
};

function formatElapsed(since: Date | undefined): string {
  if (!since) return '';
  const mins = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function TableManagement() {
  const { tables, getTablesBySection, updateTableStatus, addTable } = useTableStore();
  const { getOrdersByTable } = useOrderStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('All');
  
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTable, setNewTable] = useState({
    number: '',
    capacity: '4',
    section: 'Main Hall',
  });

  const [actionModal, setActionModal] = useState<{ type: 'free' | 'reserved' | 'occupied'; tableId: string; tableNumber: string } | null>(null);
  const [guestsCount, setGuestsCount] = useState('');
  const [reservationDetails, setReservationDetails] = useState('');
  const [actionMode, setActionMode] = useState<'seat' | 'reserve' | 'edit' | 'select_order' | 'merge'>('seat');
  const [editTableData, setEditTableData] = useState({ number: '', capacity: '4', section: '' });

  const [geometryModalTable, setGeometryModalTable] = useState<TableType | null>(null);
  const [mergeSelectedChild, setMergeSelectedChild] = useState('');
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);

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

    // Always check for active orders first, to prevent getting locked out of active bills on 'free' tables
    const activeOrders = getOrdersByTable(tableId);
    if (activeOrders.length > 0) {
      if (activeOrders.length === 1 && status !== 'free') {
        // Only 1 order -> Go straight to it (unless the table is marked free, then show modal to allow cleanup)
        navigate(`/order?table=${tableId}&orderId=${activeOrders[0].id}`);
      } else {
        // Multiple orders or stuck orders -> Show sub-table modal
        setActionModal({ type: 'occupied', tableId, tableNumber: table.number });
        setActionMode('select_order');
      }
      return;
    }

    if (status === 'free') {
      setActionModal({ type: 'free', tableId, tableNumber: table.number });
      setActionMode('seat');
      setSelectedSeats([]);
      setGuestsCount('');
      setReservationDetails('');
      setEditTableData({
        number: table.number,
        capacity: table.capacity.toString(),
        section: table.section,
      });
    } else if (status === 'reserved') {
      setActionModal({ type: 'reserved', tableId, tableNumber: table.number });
      setActionMode('seat');
      setSelectedSeats([]);
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
      const covers = selectedSeats.length > 0 ? selectedSeats.length : parseInt(guestsCount);
      if (isNaN(covers) || covers <= 0) {
        toast.error('Invalid guests', 'Please select seats or enter a valid guest count');
        return;
      }
      // Update table to occupied immediately
      updateTableStatus(actionModal.tableId, 'occupied');
      let url = `/order?table=${actionModal.tableId}&guests=${covers}`;
      if (selectedSeats.length > 0) {
        url += `&seats=${selectedSeats.join(',')}`;
      }
      navigate(url);
    }
  };

  const handleGeometrySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!geometryModalTable) return;
    
    const fd = new FormData(e.target as HTMLFormElement);
    useTableStore.getState().updateTable(geometryModalTable.id, {
      shape: fd.get('shape') as any,
      width: parseInt(fd.get('width') as string),
      height: parseInt(fd.get('height') as string),
      rotation: parseInt(fd.get('rotation') as string),
    });
    toast.success('Updated', 'Table geometry saved');
    setGeometryModalTable(null);
  };

  const handleMergeSubmit = () => {
    if (!actionModal || !mergeSelectedChild) return;
    useTableStore.getState().mergeTables([actionModal.tableId, mergeSelectedChild]);
    toast.success('Tables Merged', 'Tables have been merged successfully');
    setActionModal(null);
    setMergeSelectedChild('');
  };

  const handleUnmerge = (tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    // Safety check: Don't unmerge if there are ANY open orders for this parent table
    const activeOrders = getOrdersByTable(tableId);
    if (activeOrders.length > 0) {
      toast.error('Cannot un-merge', 'Please settle or move all active bills before un-merging.');
      return;
    }

    useTableStore.getState().splitTable(tableId);
    toast.success('Un-merged', 'Tables are now separated');
  };

  return (
    <>
      <TopBar
        title="Table Management"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            {viewMode === 'map' && (
              <button 
                className={`btn ${isEditMode ? 'btn-primary' : 'btn-outline'} btn-sm`} 
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <PencilSimple size={16} /> {isEditMode ? 'Done' : 'Edit Layout'}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setIsAddModalOpen(true)}>
              <Plus size={16} /> Add Table
            </button>
          </div>
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

        {/* Section Tabs & View Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 16 }}>
          <div className="scroll-tabs">
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
          
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', padding: 4, borderRadius: 8 }}>
            <button 
              onClick={() => { setViewMode('grid'); setIsEditMode(false); }}
              style={{ padding: '6px 12px', border: 'none', background: viewMode === 'grid' ? 'var(--surface)' : 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: viewMode === 'grid' ? 600 : 400 }}
            >
              <SquaresFour size={16} /> Grid
            </button>
            <button 
              onClick={() => setViewMode('map')}
              style={{ padding: '6px 12px', border: 'none', background: viewMode === 'map' ? 'var(--surface)' : 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', gap: 6, alignItems: 'center', boxShadow: viewMode === 'map' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: viewMode === 'map' ? 600 : 400 }}
            >
              <MapTrifold size={16} /> Map
            </button>
          </div>
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

        {/* Floor Plan / Grid */}
        {viewMode === 'map' ? (
          <FloorPlanMap 
            tables={displayTables} 
            isEditMode={isEditMode} 
            onTableClick={handleTableClick} 
            onEditTableConfig={(t) => setGeometryModalTable(t)}
          />
        ) : (
          <div className="grid grid-tables" style={{ gap: 'var(--space-4)' }}>
            {displayTables.filter(t => t.status !== 'merged').map((table) => {
              const activeOrders = getOrdersByTable(table.id);
            return (
              <div
                key={table.id}
                className={`table-card ${table.status}`}
                onClick={() => handleTableClick(table.id, table.status)}
                title={`${table.number} — ${STATUS_LABELS[table.status]}${table.reservedFor ? ': ' + table.reservedFor : ''}`}
              >
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
                  {activeOrders.length > 1 && (
                    <span style={{ fontSize: '0.65rem', background: 'var(--bg-card)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: 4, fontWeight: 700, border: '1px solid var(--border)' }}>
                      {activeOrders.length} Bills
                    </span>
                  )}
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
            );
          })}
        </div>
        )}
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
          <div className="card" style={{ width: 400, maxWidth: '90vw' }}>
            
            {actionMode === 'select_order' ? (
              // Multiple Orders / Occupied Table Modal
              <>
                <div className="card-header">
                  <div className="card-title">Table {actionModal.tableNumber} (Shared)</div>
                </div>
                <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Select an order to view/edit, or seat a new group.</div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {getOrdersByTable(actionModal.tableId).map(order => (
                      <button
                        key={order.id}
                        className="btn btn-ghost"
                        style={{ justifyContent: 'space-between', padding: '12px 16px', border: '1px solid var(--border)', textAlign: 'left' }}
                        onClick={() => {
                          navigate(`/order?table=${actionModal.tableId}&orderId=${order.id}`);
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>Order #{(order.localId || order.id).slice(0,6).toUpperCase()}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {order.seats && order.seats.length > 0 ? `Seats: ${order.seats.join(', ')}` : (order.guestCount ? `${order.guestCount} guests` : 'Active')} • {order.items.length} items
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          ₹{order.items.reduce((s,i) => s + (i.status !== 'void' ? i.totalPrice : 0), 0).toFixed(2)}
                        </div>
                      </button>
                    ))}
                  </div>

                  <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                  
                  <button 
                    className="btn btn-primary" 
                    onClick={() => {
                      setActionMode('seat');
                      setSelectedSeats([]);
                    }}
                  >
                    <Plus size={16} /> Seat New Guest (New Bill)
                  </button>
                  <button className="btn btn-ghost" onClick={() => setActionModal(null)}>Cancel</button>
                </div>
              </>
            ) : (
              // Standard Seat/Reserve/Edit Modal
              <>
                <div className="card-header">
                  <div className="card-title">Table {actionModal.tableNumber}</div>
                </div>
                <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {/* Action Mode Selector */}
                  <div className="tabs">
                    <button className={`tab-item ${actionMode === 'seat' ? 'active' : ''}`} onClick={() => setActionMode('seat')}>Seat</button>
                    <button className={`tab-item ${actionMode === 'reserve' ? 'active' : ''}`} onClick={() => setActionMode('reserve')}>Reserve</button>
                    <button className={`tab-item ${actionMode === 'edit' ? 'active' : ''}`} onClick={() => setActionMode('edit')}>Edit</button>
                    <button className={`tab-item ${actionMode === 'merge' ? 'active' : ''}`} onClick={() => setActionMode('merge')}>Merge</button>
                  </div>

                  {actionMode === 'seat' && (() => {
                    const table = tables.find(t => t.id === actionModal.tableId);
                    const capacity = table ? table.capacity : 4;
                    const activeOrders = getOrdersByTable(actionModal.tableId);
                    
                    // Find all seats currently taken by active orders
                    const takenSeats = new Set<number>();
                    activeOrders.forEach(o => {
                      if (o.seats) {
                        o.seats.forEach(s => takenSeats.add(s));
                      }
                    });

                    return (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 8 }}>Select Seats (or enter guest count)</label>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                          {Array.from({ length: capacity }).map((_, i) => {
                            const seatNum = i + 1;
                            const isTaken = takenSeats.has(seatNum);
                            const isSelected = selectedSeats.includes(seatNum);
                            return (
                              <button
                                key={seatNum}
                                type="button"
                                disabled={isTaken}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedSeats(selectedSeats.filter(s => s !== seatNum));
                                  } else {
                                    setSelectedSeats([...selectedSeats, seatNum]);
                                  }
                                  // Clear manual guest count if using seats
                                  setGuestsCount('');
                                }}
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: '50%',
                                  border: isSelected ? 'none' : '1px solid var(--border)',
                                  background: isTaken ? 'var(--bg-secondary)' : isSelected ? 'var(--brand-color)' : 'var(--surface)',
                                  color: isTaken ? 'var(--text-muted)' : isSelected ? '#fff' : 'var(--text-primary)',
                                  fontWeight: 600,
                                  cursor: isTaken ? 'not-allowed' : 'pointer',
                                  opacity: isTaken ? 0.5 : 1,
                                  boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'
                                }}
                              >
                                {seatNum}
                              </button>
                            );
                          })}
                        </div>

                        {selectedSeats.length === 0 && (
                          <input 
                            type="number" 
                            className="input" 
                            min="1" 
                            value={guestsCount} 
                            onChange={(e) => setGuestsCount(e.target.value)}
                            placeholder="Or enter total guests..."
                          />
                        )}
                      </div>
                    );
                  })()}

                  {actionMode === 'reserve' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Reservation Details</label>
                      <input 
                        className="input" 
                        value={reservationDetails} 
                        onChange={(e) => setReservationDetails(e.target.value)}
                        placeholder="Name & Time (e.g. John @ 8:00 PM)"
                        autoFocus
                      />
                    </div>
                  )}

                  {actionMode === 'edit' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Table Number / Name *</label>
                        <input 
                          className="input" 
                          value={editTableData.number} 
                          onChange={(e) => setEditTableData({ ...editTableData, number: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Capacity</label>
                          <input 
                            type="number" 
                            className="input" 
                            value={editTableData.capacity} 
                            onChange={(e) => setEditTableData({ ...editTableData, capacity: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Section</label>
                          <input 
                            className="input" 
                            value={editTableData.section} 
                            onChange={(e) => setEditTableData({ ...editTableData, section: e.target.value })}
                            list="sections"
                          />
                          <datalist id="sections">
                            {sections.filter(s => s !== 'All').map(s => <option key={s} value={s} />)}
                          </datalist>
                        </div>
                      </div>
                    </>
                  )}

                  {actionMode === 'merge' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Select table to merge with {actionModal.tableNumber}</label>
                      <select 
                        className="input" 
                        value={mergeSelectedChild} 
                        onChange={(e) => setMergeSelectedChild(e.target.value)}
                      >
                        <option value="">-- Select a free table --</option>
                        {tables
                          .filter(t => t.status === 'free' && t.id !== actionModal.tableId && t.section === tables.find(x => x.id === actionModal.tableId)?.section)
                          .map(t => (
                            <option key={t.id} value={t.id}>Table {t.number} ({t.capacity} seats)</option>
                          ))}
                      </select>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                        Only free tables in the same section are shown.
                      </div>
                    </div>
                  )}

                  {tables.find(t => t.id === actionModal.tableId)?.mergedWith && tables.find(t => t.id === actionModal.tableId)!.mergedWith!.length > 0 && (
                    <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 8 }}>This table is merged</div>
                      <button 
                        className="btn btn-outline btn-sm" 
                        style={{ width: '100%', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        onClick={() => handleUnmerge(actionModal.tableId)}
                      >
                        <ArrowsSplit size={16} /> Un-merge Tables
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleActionSubmit}>
                      {actionMode === 'seat' ? 'Open Order' : actionMode === 'reserve' ? 'Save Reservation' : actionMode === 'merge' ? 'Merge Tables' : 'Save Changes'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setActionModal(null)}>Cancel</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Geometry Edit Modal */}
      {geometryModalTable && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
          <div className="card" style={{ width: 350, maxWidth: '90vw' }}>
            <div className="card-header">
              <div className="card-title">Edit Geometry: {geometryModalTable.number}</div>
            </div>
            <form onSubmit={handleGeometrySubmit} style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Shape</label>
                <select name="shape" className="input" defaultValue={geometryModalTable.shape || 'square'}>
                  <option value="square">Square</option>
                  <option value="rectangle">Rectangle</option>
                  <option value="round">Round</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Width (px)</label>
                  <input name="width" type="number" className="input" defaultValue={geometryModalTable.width || 60} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Height (px)</label>
                  <input name="height" type="number" className="input" defaultValue={geometryModalTable.height || 60} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: 4 }}>Rotation (degrees)</label>
                <input name="rotation" type="number" className="input" defaultValue={geometryModalTable.rotation || 0} />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                <button type="button" className="btn btn-ghost" onClick={() => setGeometryModalTable(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
