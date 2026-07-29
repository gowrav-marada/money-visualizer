import { LoaderCircle, LogIn, LogOut, MoonStar, Plus, SunMedium } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { loadSettings, saveSettings } from "../lib/storage";
import { cn } from "../lib/utils";
import { Transaction } from "../types";

const App = () => {
  const auth = useAuth();
  const data = useMoneyData(auth.user?.id ?? null);
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => loadSettings().theme);
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveSettings({ ...loadSettings(), theme });
  }, [theme]);

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
          ) : (
            <Button size="icon" variant="outline" onClick={() => signInWithGoogle()} aria-label="Sign in with Google" disabled={!auth.hasSupabaseConfig}>
              <LogIn size={16} />
            </Button>
          )}

          <Button size="icon" variant="outline" onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? <SunMedium size={16} /> : <MoonStar size={16} />}
          </Button>
        </div>
      </header>

      {data.syncing ? <Card className="mb-3 py-2 text-center text-xs text-muted-foreground">Syncing data across devices...</Card> : null}

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
