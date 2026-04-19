import React, { useState, useEffect } from 'react';
import { 
  Package, 
  ShieldAlert, 
  Users, 
  Clock, 
  LogOut, 
  Plus, 
  Trash2, 
  Minus, 
  AlertTriangle, 
  CheckCircle2,
  Search,
  LayoutDashboard,
  ClipboardList
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';

// --- FIREBASE SETUP ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const getInventoryRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
const getLogsRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'logs');

export default function App() {
  // --- STATE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null); // { role: 'admin' | 'staff', name: string }
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard', 'inventory', 'logs'
  
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [issueModal, setIssueModal] = useState({ isOpen: false, item: null });

  // --- FIREBASE EFFECTS ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsubscribeInventory = onSnapshot(getInventoryRef(), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching inventory:", error);
      setIsLoading(false);
    });

    const unsubscribeLogs = onSnapshot(getLogsRef(), (snapshot) => {
      const logItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLogs(logItems);
    }, (error) => console.error("Error fetching logs:", error));

    return () => {
      unsubscribeInventory();
      unsubscribeLogs();
    };
  }, [firebaseUser]);

  // --- ACTIONS ---
  const login = (role) => {
    setCurrentUser({ 
      role, 
      name: role === 'admin' ? 'Office Admin' : `Support Staff ${Math.floor(Math.random() * 5) + 1}` 
    });
    setCurrentView('dashboard');
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const logAction = async (action, itemName, quantityChange) => {
    try {
      await addDoc(getLogsRef(), {
        timestamp: new Date().toISOString(),
        user: currentUser.name,
        action,
        itemName,
        quantityChange
      });
    } catch (error) {
      console.error("Error logging action:", error);
    }
  };

  const updateQuantity = async (id, change) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    
    const newQuantity = Math.max(0, item.quantity + change);
    if (newQuantity === item.quantity) return;

    try {
      await setDoc(doc(getInventoryRef(), id), { ...item, quantity: newQuantity });
      await logAction(change > 0 ? 'Added' : 'Removed', item.name, Math.abs(change));
    } catch (error) {
      console.error("Error updating quantity:", error);
    }
  };

  const deleteItem = async (id) => {
    const itemToDelete = inventory.find(i => i.id === id);
    if (!itemToDelete) return;

    try {
      await deleteDoc(doc(getInventoryRef(), id));
      await logAction('Deleted Item', itemToDelete.name, 0);
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const issueQty = parseInt(formData.get('issueQuantity'));
    const issueDate = formData.get('issueDate');
    const issuedTo = formData.get('issuedTo');
    const item = issueModal.item;

    const newQuantity = Math.max(0, item.quantity - issueQty);
    
    try {
      await setDoc(doc(getInventoryRef(), item.id), { 
        ...item, 
        quantity: newQuantity,
        lastIssueDate: issueDate,
        lastIssuedTo: issuedTo
      });
      await logAction(`Issued to ${issuedTo}`, item.name, issueQty);
      setIssueModal({ isOpen: false, item: null });
    } catch (error) {
      console.error("Error issuing item:", error);
    }
  };

  const addItem = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newItem = {
      name: formData.get('name'),
      category: formData.get('category'),
      quantity: parseInt(formData.get('quantity')),
      unit: formData.get('unit'),
      minThreshold: parseInt(formData.get('minThreshold')),
      purchaseDate: formData.get('purchaseDate'),
      lastIssueDate: null,
      lastIssuedTo: 'Not yet issued'
    };

    try {
      await addDoc(getInventoryRef(), newItem);
      await logAction('Created New Item', newItem.name, newItem.quantity);
      setIsAddModalOpen(false);
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const loadDemoData = async () => {
    setIsLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const INITIAL_INVENTORY = [
      { name: 'Floor Cleaner (Phenyl)', category: 'Liquids', quantity: 15, unit: 'Liters', minThreshold: 5, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Glass Cleaner', category: 'Liquids', quantity: 8, unit: 'Bottles', minThreshold: 3, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Microfiber Dusters', category: 'Tools', quantity: 24, unit: 'Pieces', minThreshold: 10, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Garbage Bags (Large)', category: 'Disposables', quantity: 50, unit: 'Rolls', minThreshold: 15, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Mops with Handle', category: 'Tools', quantity: 4, unit: 'Pieces', minThreshold: 2, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Toilet Bowl Cleaner', category: 'Liquids', quantity: 12, unit: 'Bottles', minThreshold: 5, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
      { name: 'Hand Wash Soap', category: 'Liquids', quantity: 20, unit: 'Liters', minThreshold: 10, purchaseDate: today, lastIssueDate: null, lastIssuedTo: 'Not yet issued' },
    ];
    
    for (const item of INITIAL_INVENTORY) {
      await addDoc(getInventoryRef(), item);
    }
    await logAction('System', 'Loaded Demo Data', 0);
    setIsLoading(false);
  };

  // --- DERIVED DATA ---
  const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- COMPONENTS ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-3 rounded-full">
              <Package className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Cleansing Material Hub</h1>
          <p className="text-center text-slate-500 mb-8">Select a role to preview the application</p>
          
          <div className="space-y-4">
            <button 
              onClick={() => login('admin')}
              className="w-full flex items-center justify-between p-4 border-2 border-blue-500 rounded-xl text-blue-700 hover:bg-blue-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6" />
                <div className="text-left">
                  <div className="font-bold">Login as Admin</div>
                  <div className="text-xs opacity-80">Full access, add items, view logs</div>
                </div>
              </div>
            </button>
            
            <button 
              onClick={() => login('staff')}
              className="w-full flex items-center justify-between p-4 border-2 border-emerald-500 rounded-xl text-emerald-700 hover:bg-emerald-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6" />
                <div className="text-left">
                  <div className="font-bold">Login as Staff</div>
                  <div className="text-xs opacity-80">Update quantities, log usage</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col md:min-h-screen shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 text-white border-b border-slate-800">
          <Package className="w-8 h-8 text-blue-400" />
          <span className="font-bold text-lg leading-tight">Cleansing<br/>Inventory</span>
        </div>
        
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Main Menu</div>
          <nav className="space-y-1">
            <button 
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard className="w-5 h-5" /> Dashboard
            </button>
            <button 
              onClick={() => setCurrentView('inventory')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'inventory' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <ClipboardList className="w-5 h-5" /> Manage Inventory
            </button>
            {currentUser.role === 'admin' && (
              <button 
                onClick={() => setCurrentView('logs')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'logs' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Clock className="w-5 h-5" /> Activity Logs
              </button>
            )}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${currentUser.role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div className="text-sm text-white font-medium">{currentUser.name}</div>
              <div className="text-xs text-slate-500 capitalize">{currentUser.role}</div>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
        
        {/* DASHBOARD VIEW */}
        {currentView === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-8">
              <h2 className="text-2xl font-bold text-slate-800">Welcome back, {currentUser.name}</h2>
              <p className="text-slate-500">Here is what's happening with your cleansing inventory today.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-blue-100 p-4 rounded-xl text-blue-600">
                  <Package className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-slate-500 text-sm font-medium">Total Material Types</div>
                  <div className="text-3xl font-bold text-slate-800">{inventory.length}</div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-red-100 p-4 rounded-xl text-red-600">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-slate-500 text-sm font-medium">Low Stock Alerts</div>
                  <div className="text-3xl font-bold text-red-600">{lowStockItems.length}</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-emerald-100 p-4 rounded-xl text-emerald-600">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-slate-500 text-sm font-medium">Healthy Stock Items</div>
                  <div className="text-3xl font-bold text-slate-800">{inventory.length - lowStockItems.length}</div>
                </div>
              </div>
            </div>

            {lowStockItems.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" /> Items Requiring Attention
                </h3>
                <div className="bg-white border border-red-100 rounded-xl overflow-hidden shadow-sm">
                  <ul className="divide-y divide-slate-100">
                    {lowStockItems.map(item => (
                      <li key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <div className="font-semibold text-slate-800">{item.name}</div>
                          <div className="text-sm text-slate-500">Threshold: {item.minThreshold} {item.unit}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-full text-sm">
                            Only {item.quantity} {item.unit} left
                          </span>
                          <button 
                            onClick={() => setCurrentView('inventory')}
                            className="text-blue-600 text-sm font-medium hover:underline"
                          >
                            Update
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INVENTORY VIEW */}
        {currentView === 'inventory' && (
          <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Inventory Management</h2>
                <p className="text-slate-500">View and update cleansing material stock.</p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search materials..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                  />
                </div>
                {currentUser.role === 'admin' && (
                  <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium whitespace-nowrap"
                  >
                    <Plus className="w-5 h-5" /> Add Item
                  </button>
                )}
              </div>
            </header>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="p-4 font-semibold">Material Name</th>
                      <th className="p-4 font-semibold hidden md:table-cell">Category</th>
                      <th className="p-4 font-semibold hidden md:table-cell">Purchased</th>
                      <th className="p-4 font-semibold hidden sm:table-cell">Last Issued</th>
                      <th className="p-4 font-semibold text-center">Status</th>
                      <th className="p-4 font-semibold text-center">Quantity</th>
                      <th className="p-4 font-semibold text-center">Quick Update</th>
                      {currentUser.role === 'admin' && <th className="p-4 font-semibold text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-500">
                      {isLoading ? (
                        "Loading inventory..."
                      ) : inventory.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <p>The inventory is currently empty.</p>
                          {currentUser.role === 'admin' && (
                            <button onClick={loadDemoData} className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition-colors">
                              Load Demo Data
                            </button>
                          )}
                        </div>
                      ) : (
                        "No items found matching your search."
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map(item => {
                        const isLow = item.quantity <= item.minThreshold;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="p-4 font-medium text-slate-800">{item.name}</td>
                            <td className="p-4 text-slate-500 hidden md:table-cell">{item.category}</td>
                            <td className="p-4 text-slate-500 hidden md:table-cell">{item.purchaseDate || 'N/A'}</td>
                            <td className="p-4 text-slate-500 hidden sm:table-cell">
                              {item.lastIssuedTo !== 'Not yet issued' ? (
                                <div>
                                  <div className="font-medium text-slate-700">{item.lastIssuedTo}</div>
                                  <div className="text-xs text-slate-400">{item.lastIssueDate}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Never</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {isLow ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <AlertTriangle className="w-3.5 h-3.5" /> Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center font-bold text-slate-700">
                              {item.quantity} <span className="text-xs font-normal text-slate-400 ml-1">{item.unit}</span>
                            </td>
                            <td className="p-4 text-center">
                              <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                                <button 
                                  onClick={() => setIssueModal({ isOpen: true, item })}
                                  className="p-1 rounded hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                                  title="Issue Item"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-8 text-center font-semibold text-slate-700">1</span>
                                <button 
                                  onClick={() => updateQuantity(item.id, 1)}
                                  className="p-1 rounded hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                                  title="Add 1 unit"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            {currentUser.role === 'admin' && (
                              <td className="p-4 text-right">
                                <button 
                                  onClick={() => deleteItem(item.id)}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* LOGS VIEW (Admin Only) */}
        {currentView === 'logs' && currentUser.role === 'admin' && (
          <div className="max-w-4xl mx-auto">
            <header className="mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Activity Logs</h2>
              <p className="text-slate-500">Monitor all stock updates and staff activities.</p>
            </header>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <li className="p-8 text-center text-slate-500">No recent activity.</li>
                ) : (
                  logs.map(log => (
                    <li key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50">
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2 rounded-full ${
                          log.action === 'Added' ? 'bg-emerald-100 text-emerald-600' : 
                          log.action === 'Removed' ? 'bg-amber-100 text-amber-600' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {log.action === 'Added' ? <Plus className="w-4 h-4" /> : 
                           log.action === 'Removed' ? <Minus className="w-4 h-4" /> : 
                           <Package className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-slate-800 font-medium">
                            {log.user} <span className="font-normal text-slate-500 lowercase">{log.action}</span> {log.quantityChange > 0 && <span className="font-bold">{log.quantityChange} unit(s) of</span>} {log.itemName}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(log.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}

      </main>

      {/* ADD ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Add New Material</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <LogOut className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <form onSubmit={addItem} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Material Name</label>
                <input required name="name" type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Bleach 5L" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select name="category" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option>Liquids</option>
                    <option>Tools</option>
                    <option>Disposables</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <input required name="unit" type="text" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Bottles, Pieces" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Initial Quantity</label>
                  <input required name="quantity" type="number" min="0" defaultValue="0" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Low Alert Threshold</label>
                  <input required name="minThreshold" type="number" min="1" defaultValue="5" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Purchase</label>
                <input required name="purchaseDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Save Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ISSUE MODAL */}
      {issueModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Issue {issueModal.item?.name}</h3>
              <button onClick={() => setIssueModal({ isOpen: false, item: null })} className="text-slate-400 hover:text-slate-600">
                <LogOut className="w-5 h-5 rotate-180" />
              </button>
            </div>
            <form onSubmit={handleIssue} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity to Issue</label>
                <input required name="issueQuantity" type="number" min="1" max={issueModal.item?.quantity} defaultValue="1" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <p className="text-xs text-slate-500 mt-1">Available: {issueModal.item?.quantity} {issueModal.item?.unit}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Issued To (Name)</label>
                <input required name="issuedTo" type="text" placeholder="e.g. John Doe, Cleaning Staff A" className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Issue</label>
                <input required name="issueDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIssueModal({ isOpen: false, item: null })} className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Confirm Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}