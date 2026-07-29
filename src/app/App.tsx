import { LoaderCircle, LogIn, LogOut, MoonStar, Plus, SunMedium } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, TabKey } from "../components/BottomNav";
import { AnalyticsView } from "../components/AnalyticsView";
import { DashboardView } from "../components/DashboardView";
import { InsightsView } from "../components/InsightsView";
import { TransactionForm } from "../components/TransactionForm";
import { TransactionList } from "../components/TransactionList";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { signInWithGoogle, signOut, useAuth } from "../hooks/useAuth";
import { useMoneyData } from "../hooks/useMoneyData";
import { defaultSettings, loadSettingsForUser, saveSettingsForUser } from "../lib/storage";
import { cn } from "../lib/utils";
import { Transaction } from "../types";

const App = () => {
  const auth = useAuth();
  const data = useMoneyData(auth.user?.id ?? null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const settingsReady = useRef(false);

  useEffect(() => {
    let active = true;
    const hydrateSettings = async () => {
      const next = await loadSettingsForUser(auth.user?.id ?? null);
      if (!active) {
        return;
      }
      setSettings(next);
      settingsReady.current = true;
    };

    settingsReady.current = false;
    hydrateSettings();

    return () => {
      active = false;
    };
  }, [auth.user?.id]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");

    if (!settingsReady.current) {
      return;
    }

    saveSettingsForUser(auth.user?.id ?? null, settings).catch(() => undefined);
  }, [auth.user?.id, settings]);

  const heading = useMemo(() => {
    if (activeTab === "dashboard") return "Money Visualizer";
    if (activeTab === "transactions") return "Transactions";
    if (activeTab === "analytics") return "Analytics";
    return "Insights";
  }, [activeTab]);

  const switchTab = (tab: TabKey) => {
    setShowSkeleton(true);
    setActiveTab(tab);
    window.setTimeout(() => setShowSkeleton(false), 250);
  };

  const closeSheet = () => {
    setShowAdd(false);
    setEditing(null);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-3 pb-24 pt-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="text-xs text-muted-foreground">
            {auth.isAuthenticated ? `Synced as ${auth.user?.email ?? "Google User"}` : "Premium INR finance tracker"}
          </p>
          {!auth.hasSupabaseConfig ? <p className="text-[11px] text-pay">Cloud sync disabled: add Supabase env keys.</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {auth.authLoading ? (
            <Button size="icon" variant="outline" disabled>
              <LoaderCircle size={16} className="animate-spin" />
            </Button>
          ) : auth.isAuthenticated ? (
            <Button size="icon" variant="outline" onClick={() => signOut()} aria-label="Sign out">
              <LogOut size={16} />
            </Button>
          ) : null}

          <Button
            size="icon"
            variant="outline"
            onClick={() =>
              setSettings((prev) => ({
                ...prev,
                theme: prev.theme === "dark" ? "light" : "dark"
              }))
            }
          >
            {settings.theme === "dark" ? <SunMedium size={16} /> : <MoonStar size={16} />}
          </Button>
        </div>
      </header>

      {!auth.authLoading && !auth.isAuthenticated && auth.hasSupabaseConfig ? (
        <Card className="mb-3 space-y-2 border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold">Sign in to access your cloud data</p>
          <p className="text-xs text-muted-foreground">Your transactions and settings are loaded from database and saved back automatically.</p>
          <Button className="w-full" size="lg" onClick={() => signInWithGoogle()}>
            <LogIn size={16} className="mr-2" />
            Continue with Google
          </Button>
        </Card>
      ) : null}

      {data.syncing ? <Card className="mb-3 py-2 text-center text-xs text-muted-foreground">Loading cloud data...</Card> : null}

      {data.syncError ? <Card className="mb-3 py-2 text-center text-xs text-pay">Cloud sync error: {data.syncError}</Card> : null}

      {showSkeleton ? (
        <div className="space-y-3">
          <Card className="h-20 animate-pulse" />
          <Card className="h-20 animate-pulse" />
          <Card className="h-40 animate-pulse" />
        </div>
      ) : null}

      {!showSkeleton && activeTab === "dashboard" ? <DashboardView metrics={data.metrics} /> : null}

      {!showSkeleton && activeTab === "transactions" ? (
        <TransactionList
          transactions={data.filteredTransactions}
          filters={data.filters}
          setFilters={data.setFilters}
          categories={data.categories}
          sortBy={data.sortBy}
          setSortBy={data.setSortBy}
          sortDesc={data.sortDesc}
          setSortDesc={data.setSortDesc}
          onMarkPaid={data.markPaid}
          onEdit={(item) => {
            setEditing(item);
            setShowAdd(true);
          }}
          onDelete={data.removeTransaction}
          onRefresh={data.refresh}
        />
      ) : null}

      {!showSkeleton && activeTab === "analytics" ? <AnalyticsView transactions={data.transactions} /> : null}

      {!showSkeleton && activeTab === "insights" ? <InsightsView transactions={data.transactions} /> : null}

      <button
        type="button"
        className={cn(
          "fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-glow transition active:scale-95",
          showAdd ? "scale-0 opacity-0" : "scale-100 opacity-100 animate-float"
        )}
        onClick={() => setShowAdd(true)}
        aria-label="Quick Add Transaction"
      >
        <Plus />
      </button>

      <BottomNav active={activeTab} onChange={switchTab} />

      {showAdd ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-3 backdrop-blur-sm" onClick={closeSheet}>
          <div
            className="glass mx-auto mt-12 max-w-xl rounded-3xl p-4"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <h2 className="mb-3 text-base font-semibold">{editing ? "Edit Transaction" : "Quick Add Transaction"}</h2>
            <TransactionForm
              initial={editing}
              onSubmit={(payload) => {
                if (editing) {
                  data.updateTransaction(editing.id, payload);
                } else {
                  data.addTransaction(payload);
                }
                navigator.vibrate?.(20);
                closeSheet();
              }}
              onCancel={closeSheet}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default App;
