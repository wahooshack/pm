import { PRIORITIES } from "@/lib/cards";
import { emptyFilter, isFilterActive, UNASSIGNED, type CardFilter } from "@/lib/filters";
import type { Priority } from "@/lib/kanban";

type BoardFiltersProps = {
  filter: CardFilter;
  labels: string[];
  participants: string[];
  shown: number;
  total: number;
  onChange: (filter: CardFilter) => void;
};

const control = "rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardFilters = ({ filter, labels, participants, shown, total, onChange }: BoardFiltersProps) => {
  const set = (changes: Partial<CardFilter>) => onChange({ ...filter, ...changes });
  const active = isFilterActive(filter);
  return (
    <div role="search" aria-label="Filter cards" className="flex flex-wrap items-center gap-2">
      <input type="search" value={filter.text} onChange={event => set({ text: event.target.value })}
        aria-label="Search cards" placeholder="Search cards" className={`${control} w-56`} />
      <select aria-label="Filter by priority" value={filter.priority} onChange={event => set({ priority: event.target.value as Priority | "" })} className={control}>
        <option value="">Any priority</option>
        {PRIORITIES.map(level => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}
      </select>
      <select aria-label="Filter by label" value={filter.label} onChange={event => set({ label: event.target.value })} className={control}>
        <option value="">Any label</option>
        {labels.map(label => <option key={label} value={label}>{label}</option>)}
      </select>
      <select aria-label="Filter by assignee" value={filter.assignee} onChange={event => set({ assignee: event.target.value })} className={control}>
        <option value="">Anyone</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {participants.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm text-[var(--navy-dark)]">
        <input type="checkbox" checked={filter.overdue} onChange={event => set({ overdue: event.target.checked })} />
        Overdue only
      </label>
      {active && (
        <>
          <span role="status" className="text-sm text-[var(--gray-text)]">Showing {shown} of {total} cards. Clear filters to drag.</span>
          <button type="button" onClick={() => onChange(emptyFilter)} className="text-sm font-semibold text-[var(--primary-blue)] underline">Clear filters</button>
        </>
      )}
    </div>
  );
};
