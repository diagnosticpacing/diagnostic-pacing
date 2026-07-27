import type { TopLevelTabId } from "../model";
import { topLevelTabs } from "../model";

type AdminTabsProps = {
  activeTab: TopLevelTabId;
  onChange: (tab: TopLevelTabId) => void;
};

export default function AdminTabs({
  activeTab,
  onChange,
}: AdminTabsProps) {
  return (
    <nav className="adminTabs" aria-label="Knowledge-base sections">
      {topLevelTabs.map((tab) => (
        <button
          className={activeTab === tab.id ? "isActive" : ""}
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
