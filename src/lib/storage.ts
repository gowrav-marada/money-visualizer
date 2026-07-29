import { AppSettings, Transaction } from "../types";
import { supabase } from "./supabase";

const TX_KEY = "money-visualizer.transactions.v1";
const SETTINGS_KEY = "money-visualizer.settings.v1";
const TABLE_NAME = "money_user_data";

export const defaultSettings: AppSettings = {
  theme: "dark",
  voiceEntryEnabled: false
};

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
      return [];
    }

    return JSON.parse(raw) as Transaction[];
  } catch {
    return [];
  }
};

const saveLocalTransactions = (_transactions: Transaction[]) => {
  return;
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

export const loadTransactions = (): Transaction[] => [];

export const saveTransactions = (transactions: Transaction[]) => {
  saveLocalTransactions(transactions);
};

export const loadSettings = (): AppSettings => loadLocalSettings();

export const saveSettings = (settings: AppSettings) => {
  saveLocalSettings(settings);
};

export const loadTransactionsForUser = async (userId: string | null): Promise<Transaction[]> => {
  if (!userId) {
    return [];
  }

  const cloud = await fetchCloudRow(userId);
  if (cloud?.transactions?.length) {
    return cloud.transactions;
  }

  return [];
};

export const saveTransactionsForUser = async (userId: string | null, transactions: Transaction[]) => {
  if (!userId) {
    return;
  }

  const cloud = await fetchCloudRow(userId);
  const settings = cloud?.settings ? { ...defaultSettings, ...cloud.settings } : loadLocalSettings();
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

export const migrateLocalToCloud = async (_userId: string | null) => {
  return;
};
