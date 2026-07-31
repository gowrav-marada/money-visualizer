import { Search } from "lucide-react";
import { Dispatch, SetStateAction, useMemo, useRef } from "react";
import { SortField, TransactionFilters } from "../hooks/useMoneyData";
import { Transaction } from "../types";
import { Input } from "./ui/input";
import { TransactionCard } from "./TransactionCard";

export const TransactionList = ({
  transactions,
  filters,
  setFilters,
  categories,
  sortBy,
  setSortBy,
  sortDesc,
  setSortDesc,
  onEdit,
  onDelete,
  onRefresh
}: {
  transactions: Transaction[];
  filters: TransactionFilters;
  setFilters: Dispatch<SetStateAction<TransactionFilters>>;
  categories: string[];
  sortBy: SortField;
  setSortBy: Dispatch<SetStateAction<SortField>>;
  sortDesc: boolean;
  setSortDesc: Dispatch<SetStateAction<boolean>>;
  onEdit: (item: Transaction) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) => {
  const pullStart = useRef<number | null>(null);

  const sortFields = useMemo(
    () => [
      ["date", "Date"],
      ["amount", "Amount"],
      ["person", "Person"],
      ["dueDate", "Due"]
    ],
    []
  );

  return (
    <div
      className="space-y-3 pb-28"
      onTouchStart={(event) => {
        if (window.scrollY === 0) {
          pullStart.current = event.touches[0].clientY;
        }
      }}
      onTouchMove={(event) => {
        if (pullStart.current === null) {
          return;
        }
        const distance = event.touches[0].clientY - pullStart.current;
        if (distance > 100) {
          pullStart.current = null;
          onRefresh();
          navigator.vibrate?.(20);
        }
      }}
      onTouchEnd={() => {
        pullStart.current = null;
      }}
    >
      <div className="glass sticky top-2 z-20 space-y-3 rounded-2xl p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3" size={16} />
          <Input
            className="pl-9"
            placeholder="Smart search by person, note, tags"
            value={filters.query}
            onChange={(e) => setFilters((prev) => ({ ...prev, query: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <select
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value as TransactionFilters["type"] }))}
            className="rounded-xl border border-border bg-card px-2 py-2"
          >
            <option value="all">All Types</option>
            <option value="borrowed">Borrowed</option>
            <option value="lent">Lent</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            className="rounded-xl border border-border bg-card px-2 py-2"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto money-scroll">
          {sortFields.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSortBy(value as SortField)}
              className={`rounded-full border px-3 py-1 text-xs ${sortBy === value ? "border-primary bg-primary/15" : "border-border"}`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setSortDesc((v) => !v)} className="rounded-full border border-border px-3 py-1 text-xs">
            {sortDesc ? "Desc" : "Asc"}
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-muted-foreground">No transactions match current filters.</div>
      ) : (
        transactions.map((item) => (
          <TransactionCard key={item.id} item={item} onEdit={onEdit} onDelete={onDelete} />
        ))
      )}
    </div>
  );
};
