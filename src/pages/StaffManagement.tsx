import React, { useState } from 'react';
import { useAuthStore, DEMO_USERS } from '../store/authStore';
import { useToast } from '../store/uiStore';
import { Users, Plus, PencilSimple, ToggleRight, ToggleLeft } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { User, UserRole } from '../types';

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'var(--accent)',
  manager: 'var(--status-billing)',
  cashier: 'var(--status-free)',
  waiter: 'var(--status-reserved)',
  kitchen: 'var(--status-occupied)',
};

export default function StaffManagement() {
  const { allUsers, updateUser, deactivateUser, addUser } = useAuthStore();
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'waiter' as UserRole, pin: '' });
  const [editingStaff, setEditingStaff] = useState<User | null>(null);

  const handleAdd = () => {
    if (!newStaff.name || !newStaff.pin || newStaff.pin.length !== 4) {
      toast.error('Invalid input', 'Name and 4-digit PIN are required');
      return;
    }
    addUser({ ...newStaff, active: true });
    toast.success('Staff added', `${newStaff.name} has been added`);
    setNewStaff({ name: '', email: '', role: 'waiter', pin: '' });
    setShowAdd(false);
  };

  const handleEdit = () => {
    if (!editingStaff) return;
    if (!editingStaff.name || (editingStaff.pin && editingStaff.pin.length !== 4)) {
      toast.error('Invalid input', 'Name and 4-digit PIN are required');
      return;
    }
    
    updateUser(editingStaff.id, {
      name: editingStaff.name,
      email: editingStaff.email,
      role: editingStaff.role,
      pin: editingStaff.pin,
    });
    
    toast.success('Staff updated', `${editingStaff.name} has been updated`);
    setEditingStaff(null);
  };

  return (
    <>
      <TopBar title="Staff Management" actions={
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Staff
        </button>
      } />
      <div className="page-body">
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role</th>
                  <th>PIN</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: `hsl(${user.id.charCodeAt(0) * 37 % 360}, 60%, 45%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.9375rem', fontWeight: 700, color: 'white', flexShrink: 0,
                        }}>
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{user.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 10px', borderRadius: 'var(--radius-full)',
                        background: ROLE_COLORS[user.role] + '20',
                        color: ROLE_COLORS[user.role],
                        fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize',
                      }}>
                        {user.role}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.2em' }}>
                      {'•'.repeat(user.pin?.length || 4)}
                    </td>
                    <td>
                      <span className={`badge badge-${user.active ? 'free' : 'muted'}`}>
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => setEditingStaff(user)}>
                          <PencilSimple size={16} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => {
                            if (user.active) {
                              deactivateUser(user.id);
                              toast.warning('Staff deactivated', user.name);
                            } else {
                              updateUser(user.id, { active: true });
                              toast.success('Staff activated', user.name);
                            }
                          }}
                          title={user.active ? 'Deactivate' : 'Activate'}
                        >
                          {user.active
                            ? <ToggleRight size={20} color="var(--status-free)" />
                            : <ToggleLeft size={20} color="var(--text-muted)" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><Users size={18} style={{ display: 'inline', marginRight: 8 }} />Add Staff Member</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input className="input" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Email (optional)</label>
                <input className="input" type="email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select className="input select" value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as UserRole })}>
                  {(['admin','manager','cashier','waiter','kitchen'] as UserRole[]).map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">4-Digit PIN</label>
                <input className="input" type="password" maxLength={4} value={newStaff.pin} onChange={(e) => setNewStaff({ ...newStaff, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="****" style={{ letterSpacing: '0.3em' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add Staff</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="modal-overlay" onClick={() => setEditingStaff(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><PencilSimple size={18} style={{ display: 'inline', marginRight: 8 }} />Edit Staff Member</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingStaff(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input className="input" value={editingStaff.name} onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Email (optional)</label>
                <input className="input" type="email" value={editingStaff.email} onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })} />
              </div>
              <div className="input-group">
                <label className="input-label">Role</label>
                <select className="input select" value={editingStaff.role} onChange={(e) => setEditingStaff({ ...editingStaff, role: e.target.value as UserRole })}>
                  {(['admin','manager','cashier','waiter','kitchen'] as UserRole[]).map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">4-Digit PIN</label>
                <input className="input" type="password" maxLength={4} value={editingStaff.pin || ''} onChange={(e) => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="****" style={{ letterSpacing: '0.3em' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingStaff(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
