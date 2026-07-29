import { AppSettings, Transaction } from "../types";
import { supabase } from "./supabase";

const TX_KEY = "money-visualizer.transactions.v1";
const SETTINGS_KEY = "money-visualizer.settings.v1";
const TABLE_NAME = "money_user_data";

export const defaultSettings: AppSettings = {
  theme: "dark",
  voiceEntryEnabled: false
};

const seedTransactions: Transaction[] = [
  {
    id: crypto.randomUUID(),
    type: "borrowed",
    personName: "Arjun",
    amount: 6800,
    category: "Friends",
    description: "Dinner split",
    dueDate: new Date(Date.now() + 3 * 24 * 3600000).toISOString(),
    date: new Date().toISOString(),
    status: "pending",
    notes: "Send reminder tomorrow",
    tags: ["food", "weekend"]
  },
  {
    id: crypto.randomUUID(),
    type: "lent",
    personName: "Priya",
    amount: 2200,
    category: "Bills",
    description: "Shared internet bill",
    dueDate: new Date(Date.now() + 6 * 24 * 3600000).toISOString(),
    date: new Date().toISOString(),
    status: "pending",
    notes: "Monthly settlement",
    tags: ["utility"]
  },
  {
    id: crypto.randomUUID(),
    type: "income",
    personName: "Acme Corp",
    amount: 95000,
    category: "Salary",
    description: "Monthly salary credit",
    dueDate: new Date().toISOString(),
    date: new Date().toISOString(),
    status: "paid",
    notes: "Credited on time",
    tags: ["salary"]
  },
  {
    id: crypto.randomUUID(),
    type: "expense",
    personName: "Swiggy",
    amount: 1450,
    category: "Food",
    description: "Groceries",
    dueDate: new Date().toISOString(),
    date: new Date().toISOString(),
    status: "paid",
    notes: "Weekly stock-up",
    tags: ["home"]
  }
];

type CloudRow = {
  user_id: string;
  transactions: Transaction[];
  settings: AppSettings;
  updated_at?: string;
};

const loadLocalTransactions = (): Transaction[] => {
  try {
    const raw = localStorage.getItem(TX_KEY);
    if (!raw) {
      localStorage.setItem(TX_KEY, JSON.stringify(seedTransactions));
      return seedTransactions;
    }

    return JSON.parse(raw) as Transaction[];
  } catch {
    return seedTransactions;
  }
};

const saveLocalTransactions = (transactions: Transaction[]) => {
  localStorage.setItem(TX_KEY, JSON.stringify(transactions));
};

const loadLocalSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaultSettings));
      return defaultSettings;
    }

    return { ...defaultSettings, ...(JSON.parse(raw) as AppSettings) };
  } catch {
    return defaultSettings;
  }
};

const saveLocalSettings = (settings: AppSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const fetchCloudRow = async (userId: string): Promise<CloudRow | null> => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.from(TABLE_NAME).select("user_id, transactions, settings").eq("user_id", userId).maybeSingle();

  if (error) {
    return null;
  }

  return data as CloudRow | null;
};

const upsertCloudRow = async (userId: string, transactions: Transaction[], settings: AppSettings) => {
  if (!supabase) {
    return;
  }

  await supabase.from(TABLE_NAME).upsert(
    {
      user_id: userId,
      transactions,
      settings,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
};

export const loadTransactions = (): Transaction[] => loadLocalTransactions();

export const saveTransactions = (transactions: Transaction[]) => {
  saveLocalTransactions(transactions);
};

export const loadSettings = (): AppSettings => loadLocalSettings();

export const saveSettings = (settings: AppSettings) => {
  saveLocalSettings(settings);
};

export const loadTransactionsForUser = async (userId: string | null): Promise<Transaction[]> => {
  const local = loadLocalTransactions();

  if (!userId) {
    return local;
  }

  const cloud = await fetchCloudRow(userId);
  if (cloud?.transactions?.length) {
    saveLocalTransactions(cloud.transactions);
    return cloud.transactions;
  }

  return local;
};

export const saveTransactionsForUser = async (userId: string | null, transactions: Transaction[]) => {
  saveLocalTransactions(transactions);

  if (!userId) {
    return;
  }

  const settings = loadLocalSettings();
  await upsertCloudRow(userId, transactions, settings);
};

export const loadSettingsForUser = async (userId: string | null): Promise<AppSettings> => {
  const local = loadLocalSettings();

  if (!userId) {
    return local;
  }

  const cloud = await fetchCloudRow(userId);
  if (cloud?.settings) {
    const merged = { ...defaultSettings, ...cloud.settings };
    saveLocalSettings(merged);
    return merged;
  }

  return local;
};

export const saveSettingsForUser = async (userId: string | null, settings: AppSettings) => {
  saveLocalSettings(settings);

  if (!userId) {
    return;
  }

  const transactions = loadLocalTransactions();
  await upsertCloudRow(userId, transactions, settings);
};

export const migrateLocalToCloud = async (userId: string | null) => {
  if (!userId) {
    return;
  }

  const cloud = await fetchCloudRow(userId);
  if (cloud?.transactions?.length) {
    return;
  }

  await upsertCloudRow(userId, loadLocalTransactions(), loadLocalSettings());
};
