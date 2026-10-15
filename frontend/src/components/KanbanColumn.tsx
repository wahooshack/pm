import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
  onMoveCard: (cardId: string, columnId: string) => void;
  onShift: (columnId: string, offset: -1 | 1) => void;
  onDeleteColumn: (columnId: string) => void;
  columns: Column[];
  disabled: boolean;
  editingCardId: string | null;
  onEditingChange: (cardId: string | null) => void;
};

const columnButton = "flex h-7 w-7 items-center justify-center rounded-lg text-[var(--gray-text)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--navy-dark)] disabled:hover:bg-transparent";
const arrowProps = {
  "aria-hidden": true, width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
} as const;

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard, onEditCard, onMoveCard, onShift, onDeleteColumn, columns, disabled, editingCardId, onEditingChange,
}: KanbanColumnProps) => {
  const index = columns.findIndex((entry) => entry.id === column.id);
  const droppableId = cards.length === 0 ? `${column.id}-empty-zone` : column.id;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] min-w-[220px] max-w-[340px] flex-1 basis-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
            <div className="ml-auto flex items-center">
              <button type="button" disabled={disabled || index === 0} onClick={() => onShift(column.id, -1)}
                aria-label={`Move column ${column.title} left`} title="Move left" className={columnButton}>
                <svg {...arrowProps}><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" disabled={disabled || index === columns.length - 1} onClick={() => onShift(column.id, 1)}
                aria-label={`Move column ${column.title} right`} title="Move right" className={columnButton}>
                <svg {...arrowProps}><path d="M9 6l6 6-6 6" /></svg>
              </button>
              {cards.length === 0 && columns.length > 1 && (
                <button type="button" disabled={disabled} onClick={() => onDeleteColumn(column.id)}
                  aria-label={`Delete column ${column.title}`} title="Delete empty column"
                  className={clsx(columnButton, "hover:bg-red-50 hover:text-red-700")}>
                  <svg {...arrowProps}><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
          </div>
          <input
            id={`column-title-${column.id}`}
            key={column.title}
            defaultValue={column.title}
            disabled={disabled}
            maxLength={200}
            onBlur={(event) => {
              const title = event.target.value.trim();
              if (title && title !== column.title) onRename(column.id, title);
              else event.target.value = column.title;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.value = column.title;
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            className="mt-3 w-full bg-transparent font-display text-lg font-semibold text-[var(--navy-dark)] outline-none"
            aria-label={`Column title: ${column.title}`}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
              onMove={onMoveCard}
              columns={columns}
              columnId={column.id}
              disabled={disabled}
              editing={editingCardId === card.id}
              onEditingChange={onEditingChange}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div
            data-empty-column-zone={column.id}
            className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
          >
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        disabled={disabled}
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
