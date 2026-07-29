import { AppSettings, Transaction } from "../types";
import { supabase } from "./supabase";

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

const fetchCloudRow = async (userId: string): Promise<CloudRow | null> => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.from(TABLE_NAME).select("user_id, transactions, settings").eq("user_id", userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as CloudRow | null;
};

const upsertCloudRow = async (userId: string, transactions: Transaction[], settings: AppSettings) => {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from(TABLE_NAME).upsert(
    {
      user_id: userId,
      transactions,
      settings,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(error.message);
  }
};

export const loadTransactions = (): Transaction[] => [];

export const saveTransactions = (_transactions: Transaction[]) => {
  return;
};

export const loadSettings = (): AppSettings => defaultSettings;

export const saveSettings = (_settings: AppSettings) => {
  return;
};

export const loadTransactionsForUser = async (userId: string | null): Promise<Transaction[]> => {
  if (!userId) {
    return [];
  }

  const cloud = await fetchCloudRow(userId);
  return cloud?.transactions ?? [];
};

export const saveTransactionsForUser = async (userId: string | null, transactions: Transaction[]) => {
  if (!userId) {
    return;
  }

  const cloud = await fetchCloudRow(userId);
  const settings = cloud?.settings ? { ...defaultSettings, ...cloud.settings } : defaultSettings;
  await upsertCloudRow(userId, transactions, settings);
};

export const loadSettingsForUser = async (userId: string | null): Promise<AppSettings> => {
  if (!userId) {
    return defaultSettings;
  }

  const cloud = await fetchCloudRow(userId);
  return cloud?.settings ? { ...defaultSettings, ...cloud.settings } : defaultSettings;
};

export const saveSettingsForUser = async (userId: string | null, settings: AppSettings) => {
  if (!userId) {
    return;
  }

  const cloud = await fetchCloudRow(userId);
  const transactions = cloud?.transactions ?? [];
  await upsertCloudRow(userId, transactions, settings);
};

export const migrateLocalToCloud = async (_userId: string | null) => {
  return;
};
