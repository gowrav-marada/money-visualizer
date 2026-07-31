import { useEffect, useMemo, useRef, useState } from "react";
import { loadTransactions, loadTransactionsForUser, migrateLocalToCloud, saveTransactionsForUser } from "../lib/storage";
import { monthKey } from "../lib/utils";
import { FinancialMetrics, Transaction, TransactionType } from "../types";

export type SortField = "amount" | "date" | "person" | "dueDate";

export interface TransactionFilters {
  query: string;
  type: "all" | TransactionType;
  category: string;
}

const nowMonth = monthKey(new Date().toISOString());

const healthScore = (data: { receivable: number; payable: number; income: number; expenses: number }) => {
  const liquidityRatio = data.payable === 0 ? 1.2 : Math.min(data.receivable / data.payable, 1.2);
  const savingsRatio = data.income === 0 ? 0.2 : Math.min((data.income - data.expenses) / data.income, 1);
  return Math.max(12, Math.min(98, Math.round((liquidityRatio * 45 + savingsRatio * 55) * 100 / 1.2)));
};

export const useMoneyData = (userId: string | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadTransactions());
  const [filters, setFilters] = useState<TransactionFilters>({
    query: "",
    type: "all",
    category: "all"
  });
  const [sortBy, setSortBy] = useState<SortField>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      setSyncing(true);
      try {
        await migrateLocalToCloud(userId);
        const next = await loadTransactionsForUser(userId);
        if (active) {
          setTransactions(next);
          hydrated.current = true;
          setSyncError(null);
        }
      } catch (error) {
        if (active) {
          setSyncError(error instanceof Error ? error.message : "Failed to load cloud data.");
        }
      } finally {
        if (active) {
          setSyncing(false);
        }
      }
    };

    hydrate();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated.current) {
      return;
    }

    saveTransactionsForUser(userId, transactions)
      .then(() => setSyncError(null))
      .catch((error) => setSyncError(error instanceof Error ? error.message : "Failed to save cloud data."));
  }, [transactions, userId]);

  const addTransaction = (input: Omit<Transaction, "id">) => {
    setTransactions((prev) => [{ ...input, id: crypto.randomUUID() }, ...prev]);
  };

  const updateTransaction = (id: string, patch: Partial<Transaction>) => {
    setTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)));
  };

  const removeTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  const refresh = async () => {
    setSyncing(true);
    try {
      const next = await loadTransactionsForUser(userId);
      setTransactions(next);
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to refresh cloud data.");
    } finally {
      setSyncing(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set(transactions.map((item) => item.category));
    return Array.from(set).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const base = transactions.filter((tx) => {
      const query = filters.query.toLowerCase();
      const matchesQuery =
        !query ||
        tx.personName.toLowerCase().includes(query) ||
        tx.description.toLowerCase().includes(query) ||
        tx.tags.some((tag) => tag.toLowerCase().includes(query));
      const matchesType = filters.type === "all" || tx.type === filters.type;
      const matchesCategory = filters.category === "all" || tx.category === filters.category;
      return matchesQuery && matchesType && matchesCategory;
    });

    return [...base].sort((a, b) => {
      const direction = sortDesc ? -1 : 1;
      if (sortBy === "amount") {
        return (a.amount - b.amount) * direction;
      }
      if (sortBy === "person") {
        return a.personName.localeCompare(b.personName) * direction;
      }
      const left = new Date(sortBy === "dueDate" ? a.dueDate : a.date).getTime();
      const right = new Date(sortBy === "dueDate" ? b.dueDate : b.date).getTime();
      return (left - right) * direction;
    });
  }, [filters, sortBy, sortDesc, transactions]);

  const metrics: FinancialMetrics = useMemo(() => {
    const totalReceivable = transactions
      .filter((tx) => tx.type === "borrowed")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalPayable = transactions
      .filter((tx) => tx.type === "lent")
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyIncome = transactions
      .filter((tx) => tx.type === "income" && monthKey(tx.date) === nowMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const monthlyExpenses = transactions
      .filter((tx) => tx.type === "expense" && monthKey(tx.date) === nowMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalBalance = monthlyIncome + totalReceivable - monthlyExpenses - totalPayable;
    const netCashPosition = totalReceivable - totalPayable;

    return {
      totalReceivable,
      totalPayable,
      monthlyIncome,
      monthlyExpenses,
      totalBalance,
      netCashPosition,
      financialHealthScore: healthScore({
        receivable: totalReceivable,
        payable: totalPayable,
        income: monthlyIncome,
        expenses: monthlyExpenses
      })
    };
  }, [transactions]);

  return {
    transactions,
    filteredTransactions,
    metrics,
    categories,
    filters,
    setFilters,
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    addTransaction,
    updateTransaction,
    removeTransaction,
    refresh,
    syncing,
    syncError
  };
};
