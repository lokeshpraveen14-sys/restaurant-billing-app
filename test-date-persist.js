const order = {
  id: '123',
  createdAt: new Date(),
};

// Simulate Zustand persist storing to localStorage and loading back
const serialized = JSON.stringify(order);
const loaded = JSON.parse(serialized);

try {
  loaded.createdAt.toISOString();
} catch (e) {
  console.log("Error caught:", e.message);
}
