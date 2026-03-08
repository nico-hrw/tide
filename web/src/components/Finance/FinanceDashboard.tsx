import React, { useEffect, useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, Tooltip, YAxis } from 'recharts';

interface Account {
    id: string;
    name: string;
    type: string;
    balance: number;
}

interface Transaction {
    id: string;
    date: string;
    description: string;
    amount: number;
}

export default function FinanceDashboard() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // Layout states
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

    // Form states
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [accountId, setAccountId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    const assetAccounts = accounts.filter(a => a.type === 'asset');


    const fetchData = async () => {
        try {
            const userId = localStorage.getItem('tide_user_id') || 'local-test-user';
            const accRes = await fetch(`http://localhost:8080/api/v1/finance/accounts`, {
                headers: { 'X-User-ID': userId }
            });
            if (accRes.ok) setAccounts(await accRes.json() || []);

            const txRes = await fetch(`http://localhost:8080/api/v1/finance/transactions`, {
                headers: { 'X-User-ID': userId }
            });
            if (txRes.ok) setTransactions(await txRes.json() || []);
        } catch (e) {
            console.error("Failed to fetch finance data", e);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenIncome = () => {
        setAmount(''); setDescription(''); setCategory('');
        setAccountId(assetAccounts.length > 0 ? assetAccounts[0].id : '');
        setIsIncomeModalOpen(true);
    };

    const handleOpenExpense = () => {
        setAmount(''); setDescription(''); setCategory('');
        setAccountId(assetAccounts.length > 0 ? assetAccounts[0].id : '');
        setIsExpenseModalOpen(true);
    };

    const handleOpenBudget = () => {
        setAmount(''); setDescription(''); setCategory('');
        setAccountId(assetAccounts.length > 0 ? assetAccounts[0].id : '');
        setIsBudgetModalOpen(true);
    };

    const handleOpenAsset = () => {
        setAmount(''); setDescription(''); setCategory('');
        setIsAssetModalOpen(true);
    };

    const handleCloseModals = () => {
        setIsIncomeModalOpen(false);
        setIsExpenseModalOpen(false);
        setIsBudgetModalOpen(false);
        setIsAssetModalOpen(false);
    };

    const handleSubmitTransaction = async (type: 'income' | 'expense' | 'budget' | 'asset') => {
        try {
            const userId = localStorage.getItem('tide_user_id') || 'local-test-user';
            const endpoint = (type === 'budget' || type === 'asset') ? '/api/v1/finance/accounts' : '/api/v1/finance/transactions';

            let payload: any = {};
            if (type === 'budget' || type === 'asset') {
                payload = { name: description, type: type };
                if (type === 'budget') {
                    payload.linked_account_id = accountId;
                }
            } else {
                payload = {
                    amount: parseFloat(amount) || 0,
                    description: description || 'Unnamed Transaction',
                    category: category || 'Uncategorized',
                    date: date,
                    type: type,
                    account_id: accountId
                };
            }

            const response = await fetch(`http://localhost:8080${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId,
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Failed to insert into ledger:", await response.text());
                return;
            }

            fetchData();
            handleCloseModals();
        } catch (error) {
            console.error("Transaction Error:", error);
        }
    };

    const totalGuthaben = assetAccounts.reduce((sum, a) => sum + a.balance, 0);

    // Chart Data logic
    let runningBalance = totalGuthaben - transactions.reduce((sum, t) => sum + t.amount, 0);
    const historyData = [...transactions].reverse().map(t => {
        runningBalance += t.amount;
        return {
            date: new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            balance: runningBalance
        };
    });
    // Tiny dot bug fix: Provide a baseline if empty array.
    if (historyData.length === 0) {
        for (let i = 0; i < 12; i++) {
            historyData.push({ date: `M${i}`, balance: 0 });
        }
    }

    const formatCurrency = (val: number) => val.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + '€';

    return (
        <div className="h-full flex flex-col bg-white overflow-y-auto overflow-x-hidden text-black font-sans relative">
            <div className="max-w-[1000px] mx-auto w-full px-12 py-16 flex flex-col gap-12">

                {/* Header Section: Logo + Title */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                        <span className="text-white text-2xl font-bold">$</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Finanzdashboard</h1>
                </div>

                {/* Chart Section */}
                <div className="w-full border-b-2 border-black flex items-end pb-2 gap-2 relative">
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={historyData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <YAxis domain={['dataMin - 100', 'dataMax + 100']} hide />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: any) => formatCurrency(Number(value))}
                                labelStyle={{ color: '#6b7280', fontWeight: 500 }}
                            />
                            <Area type="monotone" dataKey="balance" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Split View: Guthaben vs Monatsbudget */}
                <div className="grid grid-cols-2 gap-16 mt-4">

                    {/* Guthaben */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-medium text-gray-500">Guthaben</h2>
                            <button onClick={handleOpenAsset} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                                <span className="text-gray-600 text-sm font-bold leading-none -mt-0.5">+</span>
                            </button>
                        </div>
                        <div className="text-5xl font-semibold tracking-tight text-gray-900 mb-2">{formatCurrency(totalGuthaben)}</div>
                        <ul className="text-base font-medium flex flex-col gap-1 text-gray-600">
                            {assetAccounts.map(a => (
                                <li key={a.id} className="group flex justify-between items-center w-full max-w-[200px]">
                                    <span>-&gt; {formatCurrency(a.balance)} {a.name}</span>
                                    <button onClick={async () => {
                                        if (confirm("Delete this account?")) {
                                            const userId = localStorage.getItem('tide_user_id') || 'local-test-user';
                                            await fetch(`http://localhost:8080/api/v1/finance/accounts/${a.id}`, { method: 'DELETE', headers: { 'X-User-ID': userId } });
                                            fetchData();
                                        }
                                    }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"><X size={14} /></button>
                                </li>
                            ))}
                            {assetAccounts.length === 0 && <li className="opacity-50">-&gt; Keine Konten gefunden</li>}
                        </ul>
                    </div>

                    {/* Monatsbudget */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-medium text-gray-500">Monatsbudget</h2>
                            <button onClick={handleOpenBudget} className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                                <span className="text-gray-600 text-sm font-bold leading-none -mt-0.5">+</span>
                            </button>
                        </div>
                        {(() => {
                            const budgetAccounts = accounts.filter(a => a.type === 'budget');
                            const targetBudget = budgetAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0) || 0; // Using balance to mock target for now
                            // Calculate spent: For now mock as transactions hitting expenses vs budget? Wait, just sum expenses...
                            const totalSpent = transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
                            const fillPercent = targetBudget > 0 ? Math.min(100, (totalSpent / targetBudget) * 100) : 0;
                            return (
                                <>
                                    <div className="text-5xl font-semibold tracking-tight text-gray-900 mb-2">{totalSpent.toFixed(0)}<span className="text-3xl text-gray-400">/{targetBudget}€</span></div>
                                    <div className="h-2 bg-gray-100 rounded-full w-full flex mt-2 overflow-hidden">
                                        <div className={`rounded-full h-full transition-all duration-500 ease-out ${fillPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${fillPercent}%` }}></div>
                                    </div>
                                    {budgetAccounts.length > 0 && (
                                        <ul className="text-xs font-medium flex flex-col gap-1 text-gray-400 mt-2">
                                            {budgetAccounts.map(b => (
                                                <li key={b.id} className="group flex justify-between items-center max-w-[200px]">
                                                    {b.name}
                                                    <button onClick={async () => {
                                                        if (confirm("Delete mapping?")) {
                                                            const userId = localStorage.getItem('tide_user_id') || 'local-test-user';
                                                            await fetch(`http://localhost:8080/api/v1/finance/accounts/${b.id}`, { method: 'DELETE', headers: { 'X-User-ID': userId } });
                                                            fetchData();
                                                        }
                                                    }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity"><X size={12} /></button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                </div>

                {/* Raw HTML Table Section */}
                <div className="mt-8 flex flex-col gap-4 pb-40">
                    <div className="flex justify-between items-end">
                        <h2 className="text-lg font-medium text-gray-500">Letzte Buchungen</h2>
                        <div className="flex gap-4">
                            <button onClick={handleOpenBudget} className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Add Budget</button>
                            <button onClick={handleOpenIncome} className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Add Income</button>
                            <button onClick={handleOpenExpense} className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Add Expense</button>
                        </div>
                    </div>

                    <table className="w-full text-left mt-2">
                        <thead>
                            <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                <th className="py-4">Betrag</th>
                                <th className="py-4">Beschreibung</th>
                                <th className="py-4 text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="text-base font-medium text-gray-800">
                            {transactions.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                                    <td className={`py-4 ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                                    </td>
                                    <td className="py-4">{t.description}</td>
                                    <td className="py-4 text-right text-gray-500">{new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="py-8 text-center text-gray-400">Keine Buchungen vorhanden.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* Clean Minimal Modals */}
            {(isIncomeModalOpen || isExpenseModalOpen || isBudgetModalOpen || isAssetModalOpen) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 text-black">
                    <div className="bg-white p-6 rounded-none shadow-xl border-4 border-black w-full max-w-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold uppercase tracking-widest">
                                {isIncomeModalOpen ? "Add Income" : isExpenseModalOpen ? "Add Expense" : isBudgetModalOpen ? "Create Budget" : "Create Asset Account"}
                            </h3>
                            <button onClick={handleCloseModals} className="p-1 hover:bg-gray-100 transition-colors">
                                <X size={20} className="text-black" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {(!isBudgetModalOpen && !isAssetModalOpen) && (
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold placeholder-gray-400"
                                />
                            )}

                            {(isBudgetModalOpen || isAssetModalOpen) && (
                                <input
                                    type="text"
                                    placeholder={isAssetModalOpen ? "Account Name (e.g. PayPal)" : "Budget Name (e.g. Travel)"}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold placeholder-gray-400"
                                />
                            )}

                            {isBudgetModalOpen && (
                                <input
                                    type="number"
                                    placeholder="Target Amount"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold placeholder-gray-400"
                                />
                            )}

                            {(!isBudgetModalOpen && !isAssetModalOpen) && (
                                <input
                                    type="text"
                                    placeholder="Description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold placeholder-gray-400"
                                />
                            )}

                            {(!isBudgetModalOpen && !isAssetModalOpen) && (
                                <select
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="">Select Category</option>
                                    <option value="salary">Salary</option>
                                    <option value="groceries">Groceries</option>
                                    <option value="utilities">Utilities</option>
                                </select>
                            )}

                            {(!isAssetModalOpen) && assetAccounts.length > 0 && (
                                <select
                                    value={accountId}
                                    onChange={e => setAccountId(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white border-2 border-black text-sm focus:outline-none focus:ring-2 focus:ring-black transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="" disabled>Select Account</option>
                                    {assetAccounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            )}

                            <button
                                onClick={() => handleSubmitTransaction(isIncomeModalOpen ? 'income' : isExpenseModalOpen ? 'expense' : isBudgetModalOpen ? 'budget' : 'asset')}
                                className="w-full py-3 bg-black hover:bg-gray-800 text-white text-sm font-bold uppercase tracking-widest transition-colors mt-2"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
