import { FormEvent, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Transaction } from "../types";

const defaultTx = {
  type: "expense",
  personName: "",
  amount: "",
  category: "General",
  description: "",
  dueDate: "",
  status: "pending",
  notes: "",
  tags: "",
  attachment: ""
};

type FormState = typeof defaultTx;

export const TransactionForm = ({
  onSubmit,
  onCancel,
  initial
}: {
  onSubmit: (transaction: Omit<Transaction, "id">) => void;
  onCancel: () => void;
  initial?: Transaction | null;
}) => {
  const [state, setState] = useState<FormState>(() =>
    initial
      ? {
          type: initial.type,
          personName: initial.personName,
          amount: String(initial.amount),
          category: initial.category,
          description: initial.description,
          dueDate: initial.dueDate.slice(0, 10),
          status: initial.status,
          notes: initial.notes,
          tags: initial.tags.join(", "),
          attachment: initial.attachment ?? ""
        }
      : defaultTx
  );

  const canSubmit = useMemo(() => !!state.personName && Number(state.amount) > 0 && !!state.category, [state]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const date = new Date().toISOString();

    onSubmit({
      type: state.type as Transaction["type"],
      personName: state.personName.trim(),
      amount: Number(state.amount),
      category: state.category.trim(),
      description: state.description.trim(),
      dueDate: state.dueDate ? new Date(state.dueDate).toISOString() : date,
      date: initial?.date ?? date,
      status: state.status as Transaction["status"],
      notes: state.notes.trim(),
      tags: state.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      attachment: state.attachment.trim(),
      recurring: false
    });

    if (!initial) {
      setState(defaultTx);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          ["borrowed", "Borrowed"],
          ["lent", "Lent"],
          ["income", "Income"],
          ["expense", "Expense"]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm ${state.type === value ? "border-primary bg-primary/20" : "border-border bg-card/50"}`}
            onClick={() => setState((prev) => ({ ...prev, type: value as FormState["type"] }))}
          >
            {label}
          </button>
        ))}
      </div>
      <Input placeholder="Person Name" value={state.personName} onChange={(e) => setState((v) => ({ ...v, personName: e.target.value }))} />
      <Input type="number" placeholder="Amount (₹)" value={state.amount} onChange={(e) => setState((v) => ({ ...v, amount: e.target.value }))} />
      <Input placeholder="Category" value={state.category} onChange={(e) => setState((v) => ({ ...v, category: e.target.value }))} />
      <Input placeholder="Description" value={state.description} onChange={(e) => setState((v) => ({ ...v, description: e.target.value }))} />
      <Input type="date" value={state.dueDate} onChange={(e) => setState((v) => ({ ...v, dueDate: e.target.value }))} />
      <Input placeholder="Notes" value={state.notes} onChange={(e) => setState((v) => ({ ...v, notes: e.target.value }))} />
      <Input placeholder="Tags (comma separated)" value={state.tags} onChange={(e) => setState((v) => ({ ...v, tags: e.target.value }))} />
      <Input placeholder="Attach receipt image URL" value={state.attachment} onChange={(e) => setState((v) => ({ ...v, attachment: e.target.value }))} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {initial ? "Update Transaction" : "Add Transaction"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
