import React, { useState, useEffect } from 'react';
import { Package, ShieldAlert, Users, Clock, LogOut, Plus, Trash2, Minus, AlertTriangle, CheckCircle2, Search, LayoutDashboard, ClipboardList } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';

// 1. PASTE YOUR FIREBASE CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyA35OTz7lzX8yfH2jEIeeeaWd8nD9fuCwg",
  authDomain: "guwahati-office-inventory.firebaseapp.com",
  projectId: "guwahati-office-inventory",
  storageBucket: "guwahati-office-inventory.firebasestorage.app",
  messagingSenderId: "574183330855",
  appId: "1:574183330855:web:61a52049e67f2d88dfaa02"
};

// 2. SET YOUR ADMIN EMAIL
const ADMIN_EMAIL = 'anuj107@gmail.com';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getInventoryRef = () => collection(db, 'inventory');
const getLogsRef = () => collection(db, 'logs');

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [issueModal, setIssueModal] = useState({ isOpen: false, item: null });
  const [isLoading, setIsLoading] = useState(true);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser({
          role: user.email === ADMIN_EMAIL ? 'admin' : 'staff',
          name: user.email.split('@')[0]
        });
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsubInv = onSnapshot(getInventoryRef(), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
      setIsLoading(false);
    });
    const unsubLogs = onSnapshot(getLogsRef(), (snapshot) => {
      const logItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLogs(logItems);
    });
    return () => { unsubInv(); unsubLogs(); };
  }, [currentUser]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError(err.message.replace('Firebase: ', ''));
    }
  };

  const logout = () => firebaseSignOut(auth);

  const logAction = async (action, itemName, quantityChange) => {
    await addDoc(getLogsRef(), { timestamp: new Date().toISOString(), user: currentUser.name, action, itemName, quantityChange });
  };

  const updateQuantity = async (id, change) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newQuantity = Math.max(0, item.quantity + change);
    if (newQuantity === item.quantity) return;
    await setDoc(doc(getInventoryRef(), id), { ...item, quantity: newQuantity });
    await logAction(change > 0 ? 'Added' : 'Removed', item.name, Math.abs(change));
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

  const deleteItem = async (id) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    await deleteDoc(doc(getInventoryRef(), id));
    await logAction('Deleted Item', item.name, 0);
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
    await addDoc(getInventoryRef(), newItem);
    await logAction('Created New Item', newItem.name, newItem.quantity);
    setIsAddModalOpen(false);
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
  const filteredInventory = inventory.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase()));

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex justify-center mb-6"><div className="bg-blue-100 p-3 rounded-full"><Package className="w-10 h-10 text-blue-600" /></div></div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Cleansing Material Hub</h1>
          
          <form onSubmit={handleAuth} className="space-y-4 mt-8">
            {authError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{authError}</div>}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center mt-4 text-sm text-slate-500 hover:text-blue-600">
            {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        </div>
      </div>
    );
  }

  // MAIN APP VIEW
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
            <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><LayoutDashboard className="w-5 h-5" /> Dashboard</button>
            <button onClick={() => setCurrentView('inventory')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'inventory' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><ClipboardList className="w-5 h-5" /> Manage Inventory</button>
            {currentUser.role === 'admin' && (
              <button onClick={() => setCurrentView('logs')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'logs' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><Clock className="w-5 h-5" /> Activity Logs</button>
            )}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${currentUser.role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-sm text-white font-medium truncate">{currentUser.name}</div>
              <div className="text-xs text-slate-500 capitalize">{currentUser.role}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><LogOut className="w-4 h-4" /> Sign Out</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-screen">
        {currentView === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-8"><h2 className="text-2xl font-bold text-slate-800">Welcome back, {currentUser.name}</h2></header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-blue-100 p-4 rounded-xl text-blue-600"><Package className="w-8 h-8" /></div>
                <div><div className="text-slate-500 text-sm font-medium">Material Types</div><div className="text-3xl font-bold text-slate-800">{inventory.length}</div></div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="bg-red-100 p-4 rounded-xl text-red-600"><AlertTriangle className="w-8 h-8" /></div>
                <div><div className="text-slate-500 text-sm font-medium">Low Stock Alerts</div><div className="text-3xl font-bold text-red-600">{lowStockItems.length}</div></div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'inventory' && (
          <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-slate-800">Inventory Management</h2></div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full sm:w-64" />
                </div>
                {currentUser.role === 'admin' && (
                  <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"><Plus className="w-5 h-5" /> Add</button>
                )}
              </div>
            </header>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="p-4">Material Name</th>
                      <th className="p-4 hidden sm:table-cell">Purchased</th>
                      <th className="p-4 hidden sm:table-cell">Last Issued</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-center">Quantity</th>
                      <th className="p-4 text-center">Quick Update</th>
                      {currentUser.role === 'admin' && <th className="p-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium">{item.name}</td>
                        <td className="p-4 text-slate-500 hidden sm:table-cell">{item.purchaseDate || 'N/A'}</td>
                        <td className="p-4 text-slate-500 hidden sm:table-cell">
                          {item.lastIssuedTo && item.lastIssuedTo !== 'Not yet issued' ? (
                            <div>
                              <div className="font-medium text-slate-700">{item.lastIssuedTo}</div>
                              <div className="text-xs text-slate-400">{item.lastIssueDate}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Never</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {item.quantity <= item.minThreshold ? <span className="text-red-600 bg-red-100 px-2 py-1 rounded text-xs font-bold">LOW</span> : <span className="text-emerald-600 bg-emerald-100 px-2 py-1 rounded text-xs font-bold">OK</span>}
                        </td>
                        <td className="p-4 text-center font-bold">{item.quantity}</td>
                        <td className="p-4 text-center">
                          <div className="inline-flex bg-slate-100 rounded-lg p-1">
                            <button onClick={() => setIssueModal({ isOpen: true, item })} className="p-1 hover:bg-white rounded" title="Issue Item"><Minus className="w-4 h-4" /></button>
                            <span className="w-8 text-center font-semibold text-slate-700">1</span>
                            <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded"><Plus className="w-4 h-4" /></button>
                          </div>
                        </td>
                        {currentUser.role === 'admin' && (
                          <td className="p-4 text-right">
                            <button onClick={() => deleteItem(item.id)} className="text-red-500 p-2 hover:bg-red-50 rounded"><Trash2 className="w-5 h-5" /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {currentView === 'logs' && currentUser.role === 'admin' && (
          <div className="max-w-4xl mx-auto">
            <header className="mb-6"><h2 className="text-2xl font-bold text-slate-800">Activity Logs</h2></header>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {logs.map(log => (
                  <li key={log.id} className="p-4 hover:bg-slate-50">
                    <p className="text-slate-800"><span className="font-bold">{log.user}</span> {log.action} {log.quantityChange > 0 && `${log.quantityChange} units of`} {log.itemName}</p>
                    <p className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Add Material</h3>
            <form onSubmit={addItem} className="space-y-4">
              <input required name="name" type="text" placeholder="Name" className="w-full border p-2 rounded" />
              <input required name="category" type="text" placeholder="Category" className="w-full border p-2 rounded" />
              <div className="flex gap-4">
                <input required name="quantity" type="number" placeholder="Qty" className="w-full border p-2 rounded" />
                <input required name="minThreshold" type="number" placeholder="Low Alert At" className="w-full border p-2 rounded" />
              </div>
              <input required name="unit" type="text" placeholder="Unit (e.g. Liters)" className="w-full border p-2 rounded" />
              <div>
                <label className="block text-sm text-slate-600 mb-1">Date of Purchase</label>
                <input required name="purchaseDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border p-2 rounded" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 p-2 border rounded">Cancel</button>
                <button type="submit" className="flex-1 p-2 bg-blue-600 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ISSUE MODAL */}
      {issueModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Issue {issueModal.item?.name}</h3>
            <form onSubmit={handleIssue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity to Issue</label>
                <input required name="issueQuantity" type="number" min="1" max={issueModal.item?.quantity} defaultValue="1" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Issued To (Name)</label>
                <input required name="issuedTo" type="text" placeholder="e.g. John Doe" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Issue</label>
                <input required name="issueDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setIssueModal({ isOpen: false, item: null })} className="flex-1 px-4 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">Confirm Issue</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}