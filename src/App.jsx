import React, { useState, useEffect } from 'react';
import { Package, Users, Clock, LogOut, Plus, Trash2, Minus, AlertTriangle, Search, LayoutDashboard, ClipboardList, BarChart3, Download, Scan, Barcode, IndianRupee, Printer, UserPlus, ArrowLeft, FileSpreadsheet, FileMinus, FileText } from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, getDoc } from 'firebase/firestore';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import emailjs from '@emailjs/browser';

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
const getUsersRef = () => collection(db, 'users');

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [inventory, setInventory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); 
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [issueModal, setIssueModal] = useState({ isOpen: false, item: null });
  const [isLoading, setIsLoading] = useState(true);
  const [scannerMode, setScannerMode] = useState(null);
  const [tempBarcode, setTempBarcode] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('staff');
  const [newUserAge, setNewUserAge] = useState('');
  const [newUserGender, setNewUserGender] = useState('');
  const [userCreationStatus, setUserCreationStatus] = useState({ type: '', msg: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setCurrentUser({ uid: user.uid, ...userDoc.data() });
        } else {
          if (user.email === ADMIN_EMAIL) {
            setCurrentUser({ uid: user.uid, role: 'admin', name: 'Master Admin' });
          } else {
            await firebaseSignOut(auth);
            setCurrentUser(null);
            setAuthError('Access Denied: Your account has been removed by the Administrator.');
          }
        }
      } else { setCurrentUser(null); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsubInv = onSnapshot(getInventoryRef(), (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items); setIsLoading(false);
    });
    const unsubLogs = onSnapshot(getLogsRef(), (snapshot) => {
      const logItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      logItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLogs(logItems);
    });
    const unsubUsers = onSnapshot(getUsersRef(), (snapshot) => {
      const userItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSystemUsers(userItems);
    });
    return () => { unsubInv(); unsubLogs(); unsubUsers(); };
  }, [currentUser]);

  useEffect(() => {
    if (scannerMode) {
      const scanner = new Html5QrcodeScanner("reader", { qrbox: { width: 250, height: 150 }, fps: 5 }, false);
      scanner.render(
        (decodedText) => {
          scanner.clear();
          if (scannerMode === 'search') { setSearchTerm(decodedText); setScannerMode(null); } 
          else if (scannerMode === 'add') { setTempBarcode(decodedText); setScannerMode(null); }
        }, (err) => {}
      );
      return () => { scanner.clear().catch(e => console.error(e)); };
    }
  }, [scannerMode]);

  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError('');
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (err) { setAuthError(err.message.replace('Firebase: ', '')); }
  };

  const handleAdminCreateUser = async (e) => {
    e.preventDefault(); setUserCreationStatus({ type: '', msg: '' });
    try {
      const secondaryApp = getApps().length > 1 ? getApp("Secondary") : initializeApp(firebaseConfig, "Secondary");
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: newUserName, age: parseInt(newUserAge), gender: newUserGender, email: newUserEmail, role: newUserRole, createdAt: new Date().toISOString()
      });
      await firebaseSignOut(secondaryAuth);
      setUserCreationStatus({ type: 'success', msg: `Successfully created ${newUserRole} account for ${newUserName}!` });
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserAge(''); setNewUserGender('');
    } catch (err) { setUserCreationStatus({ type: 'error', msg: err.message.replace('Firebase: ', '') }); }
  };

  const deleteSystemUser = async (targetUserId, targetUserName) => {
    if (targetUserId === currentUser.uid) { alert("Security Lock: You cannot delete your own active session."); return; }
    if (window.confirm(`Are you sure you want to permanently revoke access for ${targetUserName}?`)) {
      try {
        await deleteDoc(doc(db, 'users', targetUserId));
        setUserCreationStatus({ type: 'success', msg: `Access permanently revoked for ${targetUserName}.` });
        await logAction('Revoked User Access', targetUserName, 0, 0, {});
      } catch (error) { setUserCreationStatus({ type: 'error', msg: 'Failed to revoke access.' }); }
    }
  };

  const logout = () => firebaseSignOut(auth);

  // 3. PASTE YOUR EMAILJS KEYS HERE
  const checkAndSendAlert = async (item, newQuantity) => {
    if (newQuantity <= item.minThreshold && item.quantity > item.minThreshold) {
      try {
        await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', { item_name: item.name, current_quantity: newQuantity, min_threshold: item.minThreshold, admin_email: ADMIN_EMAIL }, 'YOUR_PUBLIC_KEY');
      } catch (error) { console.error("Alert failed:", error); }
    }
  };

  // Upgraded log function to hold deeper ledger records (Invoice & Issuance details)
  const logAction = async (action, itemName, quantityChange, financialValue = 0, extraDetails = {}) => {
    await addDoc(getLogsRef(), { timestamp: new Date().toISOString(), user: currentUser.name, action, itemName, quantityChange, financialValue, ...extraDetails });
  };

  const updateQuantity = async (id, change) => {
    const item = inventory.find(i => i.id === id); if (!item) return;
    const newQuantity = Math.max(0, item.quantity + change); if (newQuantity === item.quantity) return;
    await setDoc(doc(getInventoryRef(), id), { ...item, quantity: newQuantity });
    await logAction(change > 0 ? 'Quick Add' : 'Quick Remove', item.name, Math.abs(change), Math.abs(change) * (item.pricePerUnit || 0), { category: item.category, unit: item.unit });
    if (change < 0) await checkAndSendAlert(item, newQuantity);
  };

  const handleIssue = async (e) => {
    e.preventDefault(); const formData = new FormData(e.target);
    const issueQty = parseInt(formData.get('issueQuantity')); const item = issueModal.item;
    const newQuantity = Math.max(0, item.quantity - issueQty); const issueValue = issueQty * (item.pricePerUnit || 0);
    const extraDetails = { issuedTo: formData.get('issuedTo'), issueDate: formData.get('issueDate'), remarks: formData.get('issueRemarks') || '', category: item.category, unit: item.unit };
    try {
      await setDoc(doc(getInventoryRef(), item.id), { ...item, quantity: newQuantity, lastIssueDate: extraDetails.issueDate, lastIssuedTo: extraDetails.issuedTo });
      await logAction(`Issue`, item.name, issueQty, issueValue, extraDetails);
      await checkAndSendAlert(item, newQuantity); setIssueModal({ isOpen: false, item: null });
    } catch (error) { console.error(error); }
  };

  const deleteItem = async (id) => {
    const item = inventory.find(i => i.id === id); if (!item) return;
    await deleteDoc(doc(getInventoryRef(), id)); await logAction('Deleted Item', item.name, 0, 0, {});
  };

  const addItem = async (e) => {
    e.preventDefault(); const formData = new FormData(e.target);
    const quantity = parseInt(formData.get('quantity'));
    const totalCost = parseFloat(formData.get('totalCost')) || 0;
    const pricePerUnit = quantity > 0 ? totalCost / quantity : 0;
    const category = formData.get('category');
    
    // Additional data perfectly mapped to "Invoices" excel sheet
    const extraDetails = {
      invoiceNo: formData.get('invoiceNo') || '', vendor: formData.get('vendor') || '',
      orderedBy: formData.get('orderedBy') || '', receivedBy: formData.get('receivedBy') || '',
      remarks: formData.get('remarks') || '', purchaseDate: formData.get('purchaseDate'),
      category: category, unit: formData.get('unit')
    };

    const newItem = {
      name: formData.get('name'), category: category, quantity: quantity, unit: formData.get('unit'),
      minThreshold: parseInt(formData.get('minThreshold')), pricePerUnit: pricePerUnit,
      barcode: formData.get('barcode') || '', lastIssueDate: null, lastIssuedTo: 'Not yet issued', ...extraDetails
    };
    await addDoc(getInventoryRef(), newItem);
    await logAction('Purchase', newItem.name, quantity, totalCost, extraDetails);
    setIsAddModalOpen(false); setTempBarcode('');
  };

  // Core Downloader Engine
  const downloadCSV = (headers, rows, filename) => {
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // Data Exporters matched to Excel Layout
  const exportInventoryCSV = () => {
    const headers = ['Barcode', 'Material Name', 'Category', 'Current Quantity', 'Unit', 'Price Per Unit (INR)', 'Total Value (INR)', 'Status', 'Date of Purchase', 'Last Issued To', 'Last Issue Date'];
    const rows = inventory.map(item => [ `"${item.barcode || 'N/A'}"`, `"${item.name}"`, `"${item.category}"`, item.quantity, `"${item.unit}"`, item.pricePerUnit ? item.pricePerUnit.toFixed(2) : 0, (item.quantity * (item.pricePerUnit || 0)).toFixed(2), item.quantity <= item.minThreshold ? 'LOW STOCK' : 'OK', `"${item.purchaseDate || 'N/A'}"`, `"${item.lastIssuedTo || 'N/A'}"`, `"${item.lastIssueDate || 'N/A'}"` ]);
    downloadCSV(headers, rows, 'Current_Inventory_Status');
  };

  const exportPurchasesCSV = () => {
    const purchaseLogs = logs.filter(log => log.action === 'Purchase');
    const headers = ['Purchased date', 'Invoice No.', 'Purchased From', 'Item Name', 'Category', 'Quantity Purchased', 'Total Cost (INR)', 'Ordered By', 'Received By', 'Remarks/Status'];
    const rows = purchaseLogs.map(log => [ `"${log.purchaseDate || new Date(log.timestamp).toLocaleDateString()}"`, `"${log.invoiceNo || 'N/A'}"`, `"${log.vendor || 'N/A'}"`, `"${log.itemName}"`, `"${log.category || 'N/A'}"`, `"${log.quantityChange} ${log.unit || ''}"`, log.financialValue || 0, `"${log.orderedBy || 'N/A'}"`, `"${log.receivedBy || 'N/A'}"`, `"${log.remarks || 'N/A'}"` ]);
    downloadCSV(headers, rows, 'Invoices_Ledger');
  };

  const exportIssuanceCSV = () => {
    const issueLogs = logs.filter(log => log.action === 'Issue');
    const headers = ['Date of Issue', 'Item Name', 'Category', 'Quantity Issued', 'Value (INR)', 'Issued To', 'Issued By (System User)', 'Remarks'];
    const rows = issueLogs.map(log => [ `"${log.issueDate || new Date(log.timestamp).toLocaleDateString()}"`, `"${log.itemName}"`, `"${log.category || 'N/A'}"`, `"${log.quantityChange} ${log.unit || ''}"`, log.financialValue || 0, `"${log.issuedTo || 'N/A'}"`, `"${log.user}"`, `"${log.remarks || 'N/A'}"` ]);
    downloadCSV(headers, rows, 'Stock_Out_Ledger');
  };

  const lowStockItems = inventory.filter(item => item.quantity <= item.minThreshold);
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase()) || (item.barcode && item.barcode.includes(searchTerm));
    const matchesStock = stockFilter === 'low' ? item.quantity <= item.minThreshold : true;
    return matchesSearch && matchesStock;
  });

  const totalCapitalLocked = inventory.reduce((sum, item) => sum + (item.quantity * (item.pricePerUnit || 0)), 0);
  const healthData = [{ name: 'Healthy Stock', value: inventory.length - lowStockItems.length }, { name: 'Low Stock', value: lowStockItems.length }];
  const HEALTH_COLORS = ['#10b981', '#ef4444'];
  const categoryMap = {}; inventory.forEach(item => { categoryMap[item.category] = (categoryMap[item.category] || 0) + 1; });
  const categoryData = Object.keys(categoryMap).map(key => ({ name: key, count: categoryMap[key] }));

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('/logo-bg.png')" }}>
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"></div>
        <div className="relative z-10 max-w-5xl w-full flex flex-col md:flex-row bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">
          <div className="w-full md:w-5/12 bg-slate-900 p-8 md:p-12 text-white flex flex-col justify-center relative">
            <div className="flex items-center gap-3 mb-8"><div className="bg-blue-500 p-2.5 rounded-xl"><Package className="w-8 h-8 text-white" /></div><span className="font-bold text-2xl tracking-tight">Cleansing Hub</span></div>
            <h1 className="text-3xl md:text-4xl font-bold mb-6 leading-tight">Welcome to your command center.</h1>
            <p className="text-slate-300 text-lg leading-relaxed mb-8">The <strong className="text-white font-semibold">Cleansing Material Hub</strong> is your comprehensive system for facility inventory management. Designed for dynamic operational needs, it empowers teams with real-time stock visibility, automated low-stock alerts, and executive-level financial reporting.</p>
            <p className="text-blue-400 font-medium tracking-wide text-sm uppercase">Streamline tracking • Drive efficiency</p>
          </div>
          <div className="w-full md:w-7/12 p-8 md:p-12 flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-md">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">System Access</h2>
              <p className="text-slate-500 mb-8">Enter your authorized email and password.</p>
              <form onSubmit={handleLogin} className="space-y-5">
                {authError && <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 font-medium">{authError}</div>}
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required minLength="6" /></div>
                <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30 active:scale-[0.98]">Secure Login</button>
              </form>
              <p className="text-center mt-6 text-sm text-slate-500">Contact your System Administrator if you need an account.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row print:bg-white">
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col md:min-h-screen shadow-xl z-10 print:hidden">
        <div className="p-6 flex items-center gap-3 text-white border-b border-slate-800"><Package className="w-8 h-8 text-blue-400" /><span className="font-bold text-lg leading-tight">Cleansing<br/>Inventory</span></div>
        <div className="p-4">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3">Main Menu</div>
          <nav className="space-y-1">
            <button onClick={() => setCurrentView('dashboard')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><LayoutDashboard className="w-5 h-5" /> Dashboard</button>
            <button onClick={() => { setCurrentView('inventory'); setStockFilter('all'); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'inventory' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><ClipboardList className="w-5 h-5" /> Manage Inventory</button>
            {currentUser.role === 'admin' && (
              <>
                <button onClick={() => setCurrentView('reports')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><BarChart3 className="w-5 h-5" /> MIS Reports</button>
                <button onClick={() => setCurrentView('users')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'users' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><Users className="w-5 h-5" /> Manage Users</button>
                <button onClick={() => setCurrentView('logs')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentView === 'logs' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}><Clock className="w-5 h-5" /> Activity Logs</button>
              </>
            )}
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${currentUser.role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'}`}>{currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '@'}</div><div className="overflow-hidden"><div className="text-sm text-white font-medium truncate">{currentUser.name || 'User'}</div><div className="text-xs text-slate-500 capitalize">{currentUser.role}</div></div></div>
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg"><LogOut className="w-4 h-4" /> Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 h-screen overflow-y-auto relative print:p-0 print:h-auto print:overflow-visible">
        {/* DASHBOARD */}
        {currentView === 'dashboard' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-8"><h2 className="text-2xl font-bold text-slate-800">Welcome back, {currentUser.name.split(' ')[0]}</h2></header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div onClick={() => { setCurrentView('stock-report'); setStockFilter('all'); }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-blue-500 hover:shadow-md transition-all group">
                <div className="bg-blue-100 p-4 rounded-xl text-blue-600 group-hover:scale-110 transition-transform"><Package className="w-8 h-8" /></div>
                <div><div className="text-slate-500 text-sm font-medium">Material Types</div><div className="text-3xl font-bold text-slate-800">{inventory.length}</div></div>
              </div>
              <div onClick={() => { setCurrentView('stock-report'); setStockFilter('low'); }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:ring-2 hover:ring-red-500 hover:shadow-md transition-all group">
                <div className="bg-red-100 p-4 rounded-xl text-red-600 group-hover:scale-110 transition-transform"><AlertTriangle className="w-8 h-8" /></div>
                <div><div className="text-slate-500 text-sm font-medium">Low Stock Alerts</div><div className="text-3xl font-bold text-red-600">{lowStockItems.length}</div></div>
              </div>
            </div>
          </div>
        )}

        {/* READ-ONLY REPORT VIEW */}
        {currentView === 'stock-report' && (
          <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">{stockFilter === 'low' ? <><AlertTriangle className="w-6 h-6 text-red-600"/> Critical Restock Report</> : 'Complete Inventory Report'}</h2>
                <p className="text-slate-500 mt-1">Read-only view for review and printing.</p>
              </div>
              <div className="flex gap-3 print:hidden">
                <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"><ArrowLeft className="w-4 h-4"/> Back</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"><Printer className="w-5 h-5" /> Print Report</button>
              </div>
            </header>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
              <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
                <table className="w-full text-left text-sm relative">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 z-10 shadow-sm">
                    <tr><th className="p-4 font-semibold">Material</th><th className="p-4 hidden md:table-cell font-semibold">Barcode</th><th className="p-4 font-semibold">Category</th><th className="p-4 hidden sm:table-cell font-semibold text-right">Unit Price</th><th className="p-4 text-center font-semibold">Status</th><th className="p-4 text-center font-semibold">Current Quantity</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium text-slate-800">{item.name}</td>
                        <td className="p-4 text-slate-500 hidden md:table-cell font-mono text-xs">{item.barcode || '-'}</td>
                        <td className="p-4 text-slate-500">{item.category}</td>
                        <td className="p-4 text-slate-500 hidden sm:table-cell text-right">{item.pricePerUnit ? `₹${item.pricePerUnit.toFixed(2)}` : '₹0.00'}</td>
                        <td className="p-4 text-center">{item.quantity <= item.minThreshold ? <span className="text-red-600 bg-red-100 px-2 py-1 rounded text-xs font-bold">LOW</span> : <span className="text-emerald-600 bg-emerald-100 px-2 py-1 rounded text-xs font-bold">OK</span>}</td>
                        <td className="p-4 text-center font-bold text-slate-700">{item.quantity} <span className="text-xs font-normal text-slate-400 ml-1">{item.unit}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* INVENTORY */}
        {currentView === 'inventory' && (
          <div className="max-w-6xl mx-auto flex flex-col h-full">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-slate-800">Inventory Management</h2></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="text" placeholder="Search name or barcode..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full" />
                </div>
                <button onClick={() => setScannerMode('search')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg"><Scan className="w-5 h-5" /> Scan</button>
                {currentUser.role === 'admin' && <button onClick={() => { setIsAddModalOpen(true); setTempBarcode(''); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"><Plus className="w-5 h-5" /> Add New Ledger Item</button>}
              </div>
            </header>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
              <div className="overflow-x-auto overflow-y-auto max-h-[75vh]">
                <table className="w-full text-left text-sm relative">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 z-10 shadow-sm">
                    <tr><th className="p-4 font-semibold">Material</th><th className="p-4 hidden md:table-cell font-semibold">Barcode</th><th className="p-4 hidden sm:table-cell font-semibold text-right">Unit Price</th><th className="p-4 text-center font-semibold">Status</th><th className="p-4 text-center font-semibold">Quantity</th><th className="p-4 text-center font-semibold">Quick Update</th>{currentUser.role === 'admin' && <th className="p-4 text-right font-semibold">Actions</th>}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInventory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium text-slate-800">{item.name}</td>
                        <td className="p-4 text-slate-500 hidden md:table-cell font-mono text-xs">{item.barcode || '-'}</td>
                        <td className="p-4 text-slate-500 hidden sm:table-cell text-right">{item.pricePerUnit ? `₹${item.pricePerUnit.toFixed(2)}` : '₹0.00'}</td>
                        <td className="p-4 text-center">{item.quantity <= item.minThreshold ? <span className="text-red-600 bg-red-100 px-2 py-1 rounded text-xs font-bold">LOW</span> : <span className="text-emerald-600 bg-emerald-100 px-2 py-1 rounded text-xs font-bold">OK</span>}</td>
                        <td className="p-4 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="p-4 text-center"><div className="inline-flex bg-slate-100 rounded-lg p-1 border border-slate-200"><button onClick={() => setIssueModal({ isOpen: true, item })} className="p-1 hover:bg-white rounded"><Minus className="w-4 h-4" /></button><span className="w-8 text-center font-semibold text-slate-700">1</span><button onClick={() => updateQuantity(item.id, 1)} disabled={currentUser.role !== 'admin'} className={`p-1 rounded ${currentUser.role === 'admin' ? 'hover:bg-white text-slate-700' : 'opacity-30 text-slate-400'}`}><Plus className="w-4 h-4" /></button></div></td>
                        {currentUser.role === 'admin' && <td className="p-4 text-right"><button onClick={() => deleteItem(item.id)} className="text-red-500 p-2 hover:bg-red-50 rounded"><Trash2 className="w-5 h-5" /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ... Users Component ... */}
        {currentView === 'users' && currentUser.role === 'admin' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-6"><h2 className="text-2xl font-bold text-slate-800">User Management</h2></header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5 text-blue-600" /> Create New Account</h3>
                {userCreationStatus.msg && <div className={`p-3 mb-4 text-sm rounded-lg border font-medium ${userCreationStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{userCreationStatus.msg}</div>}
                <form onSubmit={handleAdminCreateUser} className="space-y-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label><input required type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" /></div>
                  <div className="flex gap-3"><div className="flex-1"><label className="block text-xs font-medium text-slate-500 mb-1">Age</label><input required type="number" value={newUserAge} onChange={e => setNewUserAge(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" /></div><div className="flex-1"><label className="block text-xs font-medium text-slate-500 mb-1">Gender</label><select required value={newUserGender} onChange={e => setNewUserGender(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none"><option value="" disabled>Select...</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Role Settings</label><select required value={newUserRole} onChange={e => setNewUserRole(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none font-medium"><option value="staff">Staff (Standard Access)</option><option value="admin">Administrator (Full Access)</option></select></div>
                  <hr className="border-slate-100 my-2" />
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Login Email</label><input required type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Temporary Password</label><input required type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} minLength="6" className="w-full border border-slate-300 p-2.5 rounded-lg text-sm outline-none" /></div>
                  <button type="submit" className="w-full bg-slate-800 text-white font-medium py-2.5 rounded-lg hover:bg-slate-900 transition-colors mt-2">Generate Account</button>
                </form>
              </div>
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-fit">
                <div className="p-6 border-b border-slate-200"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" /> Active System Personnel</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600"><tr><th className="p-4 font-semibold">Name</th><th className="p-4 font-semibold">Email</th><th className="p-4 font-semibold">Role</th><th className="p-4 font-semibold text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {systemUsers.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50"><td className="p-4 font-medium text-slate-800">{user.name}</td><td className="p-4 text-slate-500">{user.email}</td><td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${user.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.role}</span></td><td className="p-4 text-right">{user.email !== ADMIN_EMAIL && user.id !== currentUser.uid && (<button onClick={() => deleteSystemUser(user.id, user.name)} className="text-red-500 p-2 hover:bg-red-50 rounded transition-colors" title="Revoke Access"><Trash2 className="w-4 h-4" /></button>)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REPORTS - Updated to map offline Excel functionality */}
        {currentView === 'reports' && currentUser.role === 'admin' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div><h2 className="text-2xl font-bold text-slate-800">Management Information Systems</h2></div>
              <div className="flex flex-wrap gap-3 print:hidden">
                <button onClick={() => exportInventoryCSV()} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm transition-colors"><FileText className="w-4 h-4" /> Current Stock</button>
                <button onClick={() => exportPurchasesCSV()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"><FileSpreadsheet className="w-4 h-4" /> Invoices Ledger</button>
                <button onClick={() => exportIssuanceCSV()} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"><FileMinus className="w-4 h-4" /> Stock Out Ledger</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"><Printer className="w-4 h-4" /> PDF Report</button>
              </div>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-emerald-600" /> Capital Valuation</h3>
                <div className="mb-6"><p className="text-sm text-slate-500 font-medium">Total Capital Locked in Inventory</p><p className="text-4xl font-bold text-slate-800 mt-1">₹{totalCapitalLocked.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
                <div className="h-64 mt-4"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={healthData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" isAnimationActive={false}>{healthData.map((entry, index) => (<Cell key={`cell-${index}`} fill={HEALTH_COLORS[index % HEALTH_COLORS.length]} />))}</Pie><RechartsTooltip /><Legend /></PieChart></ResponsiveContainer></div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" /> Category Distribution</h3>
                <div className="flex-1 h-64 min-h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}><XAxis dataKey="name" tick={{fontSize: 12}} /><YAxis allowDecimals={false} /><RechartsTooltip cursor={{fill: '#f1f5f9'}} /><Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'logs' && currentUser.role === 'admin' && (
          <div className="max-w-4xl mx-auto">
            <header className="mb-6"><h2 className="text-2xl font-bold text-slate-800">Activity Logs & Audit Trail</h2></header>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <ul className="divide-y divide-slate-100 max-h-[75vh] overflow-y-auto">
                {logs.map(log => (
                  <li key={log.id} className="p-4 hover:bg-slate-50">
                    <div className="flex justify-between"><p className="text-slate-800"><span className="font-bold">{log.user}</span> {log.action} {log.quantityChange > 0 && `${log.quantityChange} units of`} {log.itemName}</p>{log.financialValue > 0 && <span className="font-mono text-sm text-slate-500 border border-slate-200 px-2 rounded bg-white">Val: ₹{log.financialValue.toFixed(2)}</span>}</div>
                    <p className="text-xs text-slate-400 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {scannerMode && (
          <div className="fixed inset-0 bg-slate-900/90 z-[60] flex flex-col items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl flex items-center gap-2"><Scan className="text-blue-600"/> Scan Barcode</h3><button onClick={() => setScannerMode(null)} className="p-2 bg-red-50 text-red-600 rounded-full hover:bg-red-100"><LogOut className="w-5 h-5 rotate-180"/></button></div>
              <div id="reader" className="w-full overflow-hidden rounded-xl border-2 border-slate-200"></div>
            </div>
          </div>
        )}
      </main>

      {/* ENHANCED PURCHASE FORM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 print:hidden overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl my-8">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Register New Material & Purchase</h3>
            <form onSubmit={addItem} className="space-y-4">
              
              {/* Item Details */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Item Details</h4>
                <div className="flex gap-2"><div className="relative flex-1"><Barcode className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input name="barcode" type="text" placeholder="Barcode (Optional)" value={tempBarcode} onChange={(e) => setTempBarcode(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg font-mono text-sm" /></div><button type="button" onClick={() => setScannerMode('add')} className="px-4 bg-slate-800 text-white rounded-lg flex items-center gap-2 hover:bg-slate-900"><Scan className="w-4 h-4"/> Scan</button></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input required name="name" type="text" placeholder="Material Name" className="w-full border border-slate-300 p-2 rounded-lg" />
                  <input required name="category" type="text" placeholder="Category" className="w-full border border-slate-300 p-2 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label><input required name="quantity" type="number" min="0" placeholder="0" className="w-full border border-slate-300 p-2 rounded-lg" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Unit Type</label><input required name="unit" type="text" placeholder="e.g. Ltr, Pkt" className="w-full border border-slate-300 p-2 rounded-lg" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Low Alert At</label><input required name="minThreshold" type="number" min="0" placeholder="0" className="w-full border border-slate-300 p-2 rounded-lg" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Total Cost (₹)</label><input required name="totalCost" type="number" step="0.01" min="0" placeholder="0.00" className="w-full border border-slate-300 p-2 rounded-lg" /></div>
                </div>
              </div>

              {/* Invoice Details */}
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                <h4 className="text-sm font-bold text-blue-700 uppercase tracking-wider">Invoice & Logistics</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Invoice No.</label><input name="invoiceNo" type="text" placeholder="e.g. INV-1234" className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Purchased From (Vendor)</label><input name="vendor" type="text" placeholder="Vendor Name" className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Ordered By</label><input name="orderedBy" type="text" placeholder="Staff Name" className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Received By</label><input name="receivedBy" type="text" placeholder="Staff Name" className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Purchase</label><input required name="purchaseDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Remarks / Status</label><input name="remarks" type="text" placeholder="Optional notes" className="w-full border border-slate-300 p-2 rounded-lg bg-white" /></div>
                </div>
              </div>

              <div className="flex gap-2 pt-2"><button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 p-2 border border-slate-300 rounded-lg hover:bg-slate-50 font-medium">Cancel</button><button type="submit" className="flex-1 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md shadow-blue-600/20">Register & Add to Stock</button></div>
            </form>
          </div>
        </div>
      )}

      {/* ENHANCED ISSUANCE MODAL */}
      {issueModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4 text-slate-800">Issue Material</h3>
            <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-800">{issueModal.item?.name}</p>
              <p className="text-sm text-slate-500">Current Stock: <span className="font-bold text-blue-600">{issueModal.item?.quantity} {issueModal.item?.unit}</span></p>
            </div>
            <form onSubmit={handleIssue} className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Quantity to Issue</label><input required name="issueQuantity" type="number" min="1" max={issueModal.item?.quantity} defaultValue="1" className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Issued To (Name)</label><input required name="issuedTo" type="text" placeholder="e.g. John Doe" className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Date of Issue</label><input required name="issueDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Remarks (Optional)</label><input name="issueRemarks" type="text" placeholder="e.g. Department or reason" className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setIssueModal({ isOpen: false, item: null })} className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50 font-medium">Cancel</button><button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md shadow-blue-600/20">Confirm Issue</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}