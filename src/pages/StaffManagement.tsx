import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useStaffStore } from '../store/staffStore';
import { useToast } from '../store/uiStore';
import { Users, Plus, PencilSimple, ToggleRight, ToggleLeft, Money, Bank, Trash } from '@phosphor-icons/react';
import TopBar from '../components/layout/TopBar';
import { User, UserRole } from '../types';
import { formatAmount } from '../lib/gst';

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'var(--accent)',
  manager: 'var(--status-billing)',
  cashier: 'var(--status-free)',
  waiter: 'var(--status-reserved)',
  kitchen: 'var(--status-occupied)',
};

export default function StaffManagement() {
  const { allUsers, updateUser, deactivateUser, addUser, deleteUser } = useAuthStore();
  const { staffDetails, salaryRecords, updateStaffDetails, addSalaryRecord, initStaffSync } = useStaffStore();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'staff' | 'salaries'>('staff');
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  
  const [showAdd, setShowAdd] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'waiter' as UserRole, pin: '' });
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  
  // Extended details for edit
  const [editDetails, setEditDetails] = useState({ baseSalary: 0, joiningDate: '', bankAccountNo: '', ifscCode: '' });

  // Salary payment modal
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ staffId: '', amount: 0, transactionType: 'salary' as 'salary' | 'advance', month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' });

  useEffect(() => {
    initStaffSync();
  }, []);

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

  const handleEditClick = (user: User) => {
    setEditingStaff(user);
    const details = staffDetails.find(s => s.userId === user.id);
    setEditDetails({
      baseSalary: details?.baseSalary || 0,
      joiningDate: details?.joiningDate ? new Date(details.joiningDate).toISOString().slice(0, 10) : '',
      bankAccountNo: details?.bankAccountNo || '',
      ifscCode: details?.ifscCode || ''
    });
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

    updateStaffDetails(editingStaff.id, {
      baseSalary: editDetails.baseSalary,
      joiningDate: editDetails.joiningDate ? new Date(editDetails.joiningDate) : undefined,
      bankAccountNo: editDetails.bankAccountNo,
      ifscCode: editDetails.ifscCode
    });
    
    toast.success('Staff updated', `${editingStaff.name} has been updated`);
    setEditingStaff(null);
  };

  const handleAddSalary = () => {
    if (!salaryForm.staffId || salaryForm.amount <= 0) {
      toast.error('Invalid input', 'Please select staff and enter valid amount');
      return;
    }
    addSalaryRecord({
      staffId: salaryForm.staffId,
      amount: salaryForm.amount,
      transactionType: salaryForm.transactionType,
      month: salaryForm.month,
      year: salaryForm.year,
      notes: salaryForm.notes,
      paymentDate: new Date()
    });
    toast.success('Payment recorded', `${salaryForm.transactionType === 'salary' ? 'Salary' : 'Advance'} of ${formatAmount(salaryForm.amount)} recorded`);
    setShowSalaryModal(false);
  };

  return (
    <>
      <TopBar title="Staff Management" actions={
        <div style={{ display: 'flex', gap: 10 }}>
          {activeTab === 'staff' ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Add Staff
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => {
              setSalaryForm({ ...salaryForm, staffId: allUsers[0]?.id || '' });
              setShowSalaryModal(true);
            }}>
              <Money size={16} /> Record Payment
            </button>
          )}
        </div>
      } />
      
      <div className="page-body">
        <div className="tabs" style={{ padding: 3, marginBottom: 'var(--space-5)', display: 'inline-flex' }}>
          <button className={`tab-item ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={16} /> Staff List
          </button>
          <button className={`tab-item ${activeTab === 'salaries' ? 'active' : ''}`} onClick={() => setActiveTab('salaries')} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Money size={16} /> Salaries & Advances
          </button>
        </div>

        {activeTab === 'staff' && (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Role</th>
                    <th>Salary</th>
                    <th>Bank Details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((user) => {
                    const details = staffDetails.find(s => s.userId === user.id);
                    return (
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
                        <td>
                          <div style={{ fontWeight: 600 }}>{formatAmount(details?.baseSalary || 0)}/mo</div>
                        </td>
                        <td>
                          {details?.bankAccountNo ? (
                            <div style={{ fontSize: '0.8rem' }}>
                              <Bank size={14} style={{ display: 'inline', marginRight: 4 }} />
                              {details.bankAccountNo}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge badge-${user.active ? 'free' : 'muted'}`}>
                            {user.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => handleEditClick(user)}>
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
                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete staff" onClick={() => setDeleteConfirm(user)}>
                              <Trash size={16} color="var(--status-occupied)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'salaries' && (
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Staff Name</th>
                    <th>Month/Year</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryRecords.map(record => {
                    const staff = allUsers.find(u => u.id === record.staffId);
                    return (
                      <tr key={record.id}>
                        <td>{new Date(record.paymentDate).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600 }}>{staff?.name || 'Unknown Staff'}</td>
                        <td>{record.month}/{record.year}</td>
                        <td>
                          <span className={`badge badge-${record.transactionType === 'salary' ? 'free' : 'billing'}`}>
                            {record.transactionType.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatAmount(record.amount)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{record.notes || '-'}</td>
                      </tr>
                    );
                  })}
                  {salaryRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        No salary or advance records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: '90%' }}>
            <div className="modal-header">
              <span className="modal-title"><PencilSimple size={18} style={{ display: 'inline', marginRight: 8 }} />Edit Staff Member</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditingStaff(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Full Name</label>
                  <input className="input" value={editingStaff.name} onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">4-Digit PIN</label>
                  <input className="input" type="password" maxLength={4} value={editingStaff.pin || ''} onChange={(e) => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="****" style={{ letterSpacing: '0.3em' }} />
                </div>
              </div>
              
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Role</label>
                  <select className="input select" value={editingStaff.role} onChange={(e) => setEditingStaff({ ...editingStaff, role: e.target.value as UserRole })}>
                    {(['admin','manager','cashier','waiter','kitchen'] as UserRole[]).map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Base Salary (/mo)</label>
                  <input className="input" type="number" value={editDetails.baseSalary} onChange={(e) => setEditDetails({ ...editDetails, baseSalary: Number(e.target.value) })} />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Joining Date</label>
                <input className="input" type="date" value={editDetails.joiningDate} onChange={(e) => setEditDetails({ ...editDetails, joiningDate: e.target.value })} />
              </div>

              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Bank Account No.</label>
                  <input className="input" value={editDetails.bankAccountNo} onChange={(e) => setEditDetails({ ...editDetails, bankAccountNo: e.target.value })} />
                </div>
                <div className="input-group">
                  <label className="input-label">IFSC Code</label>
                  <input className="input" value={editDetails.ifscCode} onChange={(e) => setEditDetails({ ...editDetails, ifscCode: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingStaff(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Salary Payment Modal */}
      {showSalaryModal && (
        <div className="modal-overlay" onClick={() => setShowSalaryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title"><Money size={18} style={{ display: 'inline', marginRight: 8 }} />Record Payment</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowSalaryModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Staff Member</label>
                <select className="input select" value={salaryForm.staffId} onChange={(e) => setSalaryForm({ ...salaryForm, staffId: e.target.value })}>
                  {allUsers.filter(u => u.active).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Type</label>
                  <select className="input select" value={salaryForm.transactionType} onChange={(e) => setSalaryForm({ ...salaryForm, transactionType: e.target.value as any })}>
                    <option value="salary">Salary</option>
                    <option value="advance">Advance</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Amount</label>
                  <input className="input" type="number" value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div className="input-group">
                  <label className="input-label">Month</label>
                  <select className="input select" value={salaryForm.month} onChange={(e) => setSalaryForm({ ...salaryForm, month: Number(e.target.value) })}>
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Year</label>
                  <input className="input" type="number" value={salaryForm.year} onChange={(e) => setSalaryForm({ ...salaryForm, year: Number(e.target.value) })} />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Notes (Optional)</label>
                <input className="input" value={salaryForm.notes} onChange={(e) => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSalaryModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddSalary}>Save Payment</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Staff Confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380, maxWidth: '90%' }}>
            <div className="modal-header">
              <span className="modal-title" style={{ color: 'var(--status-occupied)' }}>
                <Trash size={18} style={{ display: 'inline', marginRight: 8 }} />Delete Staff Member
              </span>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to permanently delete <strong>{deleteConfirm.name}</strong>? All their data will be removed.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--status-occupied)', color: '#fff' }} onClick={() => {
                deleteUser(deleteConfirm.id);
                toast.success('Deleted', deleteConfirm.name + ' has been removed');
                setDeleteConfirm(null);
              }}>
                <Trash size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
