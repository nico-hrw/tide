import type {
    DataStoreSlice,
    FinanceAccount,
    FinanceSlice,
    FinanceTransaction,
} from './types';
import { apiFetch } from '@/lib/api';

export const createFinanceSlice: DataStoreSlice<FinanceSlice> = (set) => ({
    accounts: [],
    transactions: [],
    financeAccounts: [],
    financeTransactions: [],

    setFinanceAccounts: (accounts: FinanceAccount[]) =>
        set({ accounts, financeAccounts: accounts }),

    setFinanceTransactions: (transactions: FinanceTransaction[]) =>
        set({ transactions, financeTransactions: transactions }),

    fetchFinanceData: async () => {
        try {
            const [accRes, txRes] = await Promise.all([
                apiFetch('/api/v1/finance/accounts'),
                apiFetch('/api/v1/finance/transactions'),
            ]);

            let accounts: FinanceAccount[] = [];
            let transactions: FinanceTransaction[] = [];

            if (accRes.ok) {
                const data = (await accRes.json().catch(() => null)) as unknown;
                if (Array.isArray(data)) {
                    accounts = data as FinanceAccount[];
                }
            }

            if (txRes.ok) {
                const data = (await txRes.json().catch(() => null)) as unknown;
                if (Array.isArray(data)) {
                    transactions = data as FinanceTransaction[];
                }
            }

            set({
                accounts,
                financeAccounts: accounts,
                transactions,
                financeTransactions: transactions,
            });
        } catch (error) {
            console.error('[FinanceSlice] Failed to fetch finance data:', error);
        }
    },
});
