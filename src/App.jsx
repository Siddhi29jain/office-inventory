import React, { useState, useEffect } from 'react';
import { Package, ShieldAlert, Users, Clock, LogOut, Plus, Trash2, Minus, AlertTriangle, CheckCircle2, Search, LayoutDashboard, ClipboardList, BarChart3, Download, Scan, Barcode, IndianRupee } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDoc } from 'firebase/firestore';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

// 1. PASTE YOUR REAL FIREBASE CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyA35OTz7lzX8yfH2jEIeeeaWd8nD9fuCwg",
  authDomain: "guwahati-office-inventory.firebaseapp.com",
  projectId: "guwahati-office-inventory",
  storageBucket: "guwahati-office-inventory.firebasestorage.app",
  messagingSenderId: "574183330855",
  appId: "1:574183330855:web:61a52049e67f2d88dfaa02"
};

// 2. SET YOUR ADMIN EMAIL HERE
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

  // Scanner State
  const [scannerMode, setScannerMode] = useState(null);
  const [tempBarcode, setTempBarcode] = useState('');

  // Auth & Profile State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setCurrentUser({ uid: user.uid, ...userDoc.data() });
        } else {
          setCurrentUser({ 
            uid: user.uid, 
            role: user.email === ADMIN_EMAIL ? 'admin' : 'staff', 
            name: user.email.split('@')[0] 
          });
        }
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

  // --- Camera Scanner Logic ---
  useEffect(() => {
    if (scannerMode) {
      const scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 150 }, fps: 5 }, false);
      scanner.render(
        (decodedText) => {
          scanner.clear();
          if (scannerMode === 'search') {
            setSearchTerm(decodedText);
            setScannerMode(null);
          } else if (scannerMode === 'add') {
            setTempBarcode(decodedText);
            setScannerMode(null);
          }
        },
        (err) => {}
      );
      return () => { scanner.clear().catch(e => console.error(e)); };
    }
  }, [scannerMode]);

  // --- Actions ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: name, age: parseInt(age), gender: gender, email: email,
          role: email === ADMIN_EMAIL ? 'admin' : 'staff', createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) { setAuthError(err.message.replace('Firebase: ', '')); }
  };

  const logout = () => firebaseSignOut(auth);

  const logAction = async (action, itemName, quantityChange, financialValue = 0) => {
    await addDoc(getLogsRef(), { 
      timestamp: new Date().toISOString(), 
      user: currentUser.name, 
      action, 
      itemName, 
      quantityChange,
      financialValue
    });
  };

  const updateQuantity = async (id, change) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newQuantity = Math.max(0, item.quantity + change);
    if (newQuantity === item.quantity) return;
    await setDoc(doc(getInventoryRef(), id), { ...item, quantity: newQuantity });
    await logAction(change > 0 ? 'Added' : 'Removed', item.name, Math.abs(change), Math.abs(change) * (item.pricePerUnit || 0));
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const issueQty = parseInt(formData.get('issueQuantity'));
    const item = issueModal.item;
    const newQuantity = Math.max(0, item.quantity - issueQty);
    const issueValue = issueQty * (item.pricePerUnit || 0);
    
    try {
      await setDoc(doc(getInventoryRef(), item.id), { 
        ...item, quantity: newQuantity, lastIssueDate: formData.get('issueDate'), lastIssuedTo: formData.get('issuedTo')
      });
      await logAction(`Issued to ${formData.get('issuedTo')}`, item.name, issueQty, issueValue);
      setIssueModal({ isOpen: false, item: null });
    } catch (error) { console.error(error); }
  };

  const deleteItem = async (id) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    await deleteDoc(doc(getInventoryRef(), id));
    await logAction('Deleted Item', item.name, 0, 0);
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
      pricePerUnit: parseFloat(formData.get('pricePerUnit')) || 0,
      purchaseDate: formData.get('purchaseDate'),
      barcode: formData.get('barcode') || '',
      lastIssueDate: null,
      lastIssuedTo: 'Not yet issued'
    };
    await addDoc(getInventoryRef(), newItem);
    await logAction('Created New Item', newItem.name, newItem.quantity, newItem.quantity * newItem.pricePerUnit);
    setIsAddModalOpen(false);
    setTempBarcode('');
  };

  const exportToCSV = () => {
    const headers = ['Barcode', 'Material Name', 'Category', 'Current Quantity', 'Unit', 'Unit Price (INR)', 'Total Value (INR)', 'Status', 'Date of Purchase', 'Last Issued To', 'Last Issue Date'];
    const rows = inventory.map(item => [
      `"${item.barcode || 'N/A'}"`, `"${item.name}"`, `"${item.category}"`, item.quantity, `"${item.unit}"`,
      item.pricePerUnit || 0, (item.quantity * (item.pricePerUnit || 0)).toFixed(2),
      item.quantity <= item.minThreshold ? 'LOW STOCK' : 'OK', `"${item.purchaseDate || 'N/A'}"`, `"${item.lastIssuedTo || 'N/A'}"`, `"${item.lastIssueDate || 'N/A'}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Inventory_Financial_MIS_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.barcode && item.barcode.includes(searchTerm))
  );

  const totalCapitalLocked = inventory.reduce((sum, item) => sum + (item.quantity * (item.pricePerUnit || 0)), 0);

  // --- Chart Data Processing ---
  const healthData = [
    { name: 'Healthy Stock', value: inventory.length - lowStockItems.length },
    { name: 'Low Stock', value: lowStockItems.length }
  ];
  const HEALTH_COLORS = ['#10b981', '#ef4444']; // Emerald, Red

  const categoryMap = {};
  inventory.forEach(item => {
    categoryMap[item.category] = (categoryMap[item.category] || 0) + 1;
  });
  const categoryData = Object.keys(categoryMap).map(key => ({ name: key, count: categoryMap[key] }));

  // LOGIN SCREEN
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex justify-center mb-6"><div className="bg-blue-100 p-3 rounded-full"><Package className="w-10 h-10 text-blue-600" /></div></div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-2">Cleansing Material Hub</h1>
          
          <form onSubmit={handleAuth} className="space-y-4 mt-8">
            {authError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{authError}</div>}
            {isSignUp && (
              <div className="space-y-4 p-4 bg-slate-50 border border-slate-100 rounded-xl mb-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Profile Details</h3>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" required /></div>
                <div className="flex gap-4">
                  <div className="flex-1"><label className="block text-sm font-medium text-slate-700 mb-1">Age</label><input type="number" value={age} onChange={e => setAge(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" required /></div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                    <select value={gender} onChange={e => setGender(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" required>
                      <option value="" disabled>Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" required minLength="6" /></div>
            <button type="submit" className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700">{isSignUp ? 'Create Account Securely' : 'Sign In'}</button>
          </form>
          <button onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }} className="w-full text-center mt-4 text-sm text-slate-500 hover:text-blue-600 font-medium">{isSignUp ? 'Already have an account? Sign in' : 'Need an account? Create one'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col md:min-h-screen shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 text-white border-b border-slate-800"><Package className="w-8 h-8 text-blue-400" /><span className="font-bold text-lg leading-tight">Cleansing<br/>Inventory</span></div>
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Main Menu</div>
          <nav className="space-y-1">
            <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><LayoutDashboard className="w-5 h-5" /> Dashboard</button>
            <button onClick={() => setCurrentView('inventory')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'inventory' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><ClipboardList className="w-5 h-5" /> Manage Inventory</button>
            {currentUser.role === 'admin' && (
              <>
                <button onClick={() => setCurrentView('reports')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><BarChart3 className="w-5 h-5" /> MIS Reports</button>
                <button onClick={() => setCurrentView('logs')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'logs' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><Clock className="w-5 h-5" /> Activity Logs</button>
              </>
            )}
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${currentUser.role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'}`}>{currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '@'}</div>
            <div className="overflow-hidden"><div className="text-sm text-white font-medium truncate">{currentUser.name || 'User'}</div><div className="text-xs text-slate-500 capitalize">{currentUser.role}</div></div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg"><LogOut className="w-4 h-4" /> Sign Out</button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 h-screen overflow-y-auto relative">
        
        {/* DASHBOARD VIEW */}
        {currentView === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-8"><h2 className="text-2xl font-bold text-slate-800">Welcome back, {currentUser.name.split(' ')[0]}</h2></header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"><div className="bg-blue-100 p-4 rounded-xl text-blue-600"><Package className="w-8 h-8" /></div><div><div className="text-slate-500 text-sm font-medium">Material Types</div><div className="text-3xl font-bold text-slate-800">{inventory.length}</div></div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4"><div className="bg-red-100 p-4 rounded-xl text-red-600"><AlertTriangle className="w-8 h-8" /></div><div><div className="text-slate-500 text-sm font-medium">Low Stock Alerts</div><div className="text-3xl font-bold text-red-600">{lowStockItems.length}</div></div></div>
            </div>
          </div>
        )}

        {/* INVENTORY VIEW */}
        {currentView === 'inventory' && (
          <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-slate-800">Inventory Management</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Search name or barcode..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full" />