import React, { useRef, useState, useEffect } from 'react';
import { Table, TableStatus } from '../../types';
import { useTableStore } from '../../store/tableStore';
import { useOrderStore } from '../../store/orderStore';

interface FloorPlanMapProps {
  tables: Table[];
  isEditMode: boolean;
  onTableClick: (tableId: string, status: TableStatus) => void;
  onEditTableConfig: (table: Table) => void;
}

export default function FloorPlanMap({ tables, isEditMode, onTableClick, onEditTableConfig }: FloorPlanMapProps) {
  const { updateTablePosition } = useTableStore();
  const { getOrdersByTable } = useOrderStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const [draggingTable, setDraggingTable] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);

  const handlePointerDown = (e: React.PointerEvent, table: Table) => {
    if (!isEditMode) return;
    
    setHasDragged(false);
    setDraggingTable(table.id);
    setDragOffset({
      x: e.clientX - table.posX,
      y: e.clientY - table.posY,
    });
    
    // Set pointer capture so we don't lose the drag if mouse moves fast
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isEditMode || !draggingTable || !containerRef.current) return;
    setHasDragged(true);

    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Snap to grid (e.g., 20px grid)
    const snappedX = Math.round(newX / 20) * 20;
    const snappedY = Math.round(newY / 20) * 20;
    
    updateTablePosition(draggingTable, Math.max(0, snappedX), Math.max(0, snappedY));
  };

  const handlePointerUp = (e: React.PointerEvent, table: Table) => {
    if (draggingTable) {
      setDraggingTable(null);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleClick = (e: React.MouseEvent, table: Table) => {
    if (isEditMode) {
      if (!hasDragged) {
        onEditTableConfig(table);
      }
    } else {
      onTableClick(table.id, table.status);
    }
  };

  // Only show tables that aren't merged into another table
  // (merged children are hidden visually, their capacity is added to the parent)
  const visibleTables = tables.filter(t => t.status !== 'merged');

  return (
    <div 
      ref={containerRef}
      className={`floor-plan-container ${isEditMode ? 'edit-mode' : ''}`}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '70vh',
        backgroundColor: isEditMode ? 'var(--bg-secondary)' : 'transparent',
        backgroundImage: isEditMode 
          ? 'linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)' 
          : 'none',
        backgroundSize: '20px 20px',
        borderRadius: 16,
        overflow: 'hidden',
        border: isEditMode ? '2px dashed var(--brand-color)' : 'none'
      }}
    >
      {visibleTables.map((table, index) => {
        let displayX = table.posX ?? 0;
        let displayY = table.posY ?? 0;
        
        // Auto-arrange tables that haven't been positioned yet or have legacy grid indices (e.g. 0, 1, 2, 3)
        // Since no physical layout would have a table 3 pixels away from the origin, this is a safe heuristic.
        if (displayX < 15 && displayY < 15) {
          displayX = 20 + (index % 6) * 100;
          displayY = 20 + Math.floor(index / 6) * 100;
        }

        const activeOrdersCount = getOrdersByTable(table.id, table.number).length;
        const effectiveStatus = (table.status === 'free' && activeOrdersCount > 0) ? 'occupied' : table.status;

        const isOccupied = effectiveStatus === 'occupied';
        const isBilling = effectiveStatus === 'billing';
        const isReserved = effectiveStatus === 'reserved';
        const isCleaning = effectiveStatus === 'cleaning';
        
        let bg = 'var(--surface)';
        let color = 'var(--text-primary)';
        let border = '1px solid var(--border-color)';
        
        if (isOccupied) { bg = 'var(--status-occupied)'; color = '#fff'; border = 'none'; }
        if (isReserved) { bg = 'var(--status-reserved)'; color = '#fff'; border = 'none'; }
        if (isBilling) { bg = 'var(--status-billing)'; color = '#fff'; border = 'none'; }
        if (isCleaning) { bg = 'var(--status-cleaning)'; color = '#fff'; border = 'none'; }
        if (isEditMode) { border = draggingTable === table.id ? '2px solid var(--brand-color)' : border; }

        
        // Calculate dynamic name/capacity for merged tables
        let displayName = table.number;
        let displayCapacity = table.capacity;
        if (table.mergedWith && table.mergedWith.length > 0) {
          const mergedNames = table.mergedWith.map(id => {
            const t = useTableStore.getState().tables.find(xt => xt.id === id);
            if (t) displayCapacity += t.capacity;
            return t?.number;
          }).filter(Boolean);
          displayName = `${table.number} + ${mergedNames.join('+')}`;
        }

        return (
          <div
            key={table.id}
            onPointerDown={(e) => {
              if (!isEditMode) return;
              setHasDragged(false);
              setDraggingTable(table.id);
              setDragOffset({ x: e.clientX - displayX, y: e.clientY - displayY });
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerUp(e, table)}
            onClick={(e) => handleClick(e, table)}
            style={{
              position: 'absolute',
              left: displayX,
              top: displayY,
              width: table.width || 60,
              height: table.height || 60,
              backgroundColor: bg,
              color: color,
              border: border,
              borderRadius: table.shape === 'round' ? '50%' : '8px',
              transform: `rotate(${table.rotation || 0}deg)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isEditMode ? (draggingTable === table.id ? 'grabbing' : 'grab') : 'pointer',
              boxShadow: isEditMode && draggingTable === table.id 
                ? '0 12px 24px rgba(0,0,0,0.2)' 
                : '0 4px 12px rgba(0,0,0,0.05)',
              transition: isEditMode && draggingTable === table.id ? 'none' : 'box-shadow 0.2s, background-color 0.2s',
              zIndex: draggingTable === table.id ? 100 : 10,
              userSelect: 'none'
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '1rem', zIndex: 2, whiteSpace: 'nowrap' }}>{displayName}</span>
            {displayCapacity > 0 && (
              <span style={{ fontSize: '0.65rem', opacity: 0.9, zIndex: 2 }}>
                {displayCapacity} {displayCapacity === 1 ? 'seat' : 'seats'}
              </span>
            )}

            {/* Badges */}
            {activeOrdersCount > 1 && !isEditMode && (
              <div style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: 'var(--brand-color)',
                color: 'var(--bg-primary)',
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 12,
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                zIndex: 3,
                transform: `rotate(-${table.rotation || 0}deg)` // counter-rotate so text is readable
              }}>
                {activeOrdersCount} Bills
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
