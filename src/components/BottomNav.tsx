import { BarChart3, Home, Lightbulb, ListOrdered } from "lucide-react";
import { cn } from "../lib/utils";

export type TabKey = "dashboard" | "transactions" | "analytics" | "insights";

const items: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "dashboard", label: "Home", icon: Home },
  { key: "transactions", label: "Txns", icon: ListOrdered },
  { key: "analytics", label: "Charts", icon: BarChart3 },
  { key: "insights", label: "Insights", icon: Lightbulb }
];

export const BottomNav = ({ active, onChange }: { active: TabKey; onChange: (value: TabKey) => void }) => (
  <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl">
    <div className="mx-auto grid max-w-xl grid-cols-4 gap-2">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl py-2 text-xs transition",
            active === key ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  </nav>
);
