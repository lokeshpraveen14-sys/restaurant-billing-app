const { create } = require('zustand');
const useStore = create((set) => ({
  orders: [],
  addOrder: () => set(state => ({ orders: [...state.orders, { id: 1 }] }))
}));

// In Zustand, does calling useStore() subscribe to all changes?
console.log('Yes, it does.');
