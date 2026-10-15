"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCorners, pointerWithin, type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import type { CardChanges } from "@/components/KanbanCard";
import { BoardFilters } from "@/components/BoardFilters";
import { boardLabels, emptyFilter, isFilterActive, matchesFilter } from "@/lib/filters";
import { todayIso } from "@/lib/cards";
import { createId, MAX_COLUMNS, moveCard, shiftColumn, type BoardData } from "@/lib/kanban";
import { api, ApiError } from "@/lib/api";

type KanbanBoardProps = { boardId: number; onBoardRenamed?: (name: string) => void; onSessionExpired?: (message: string) => void };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
const pointerWithinOrClosestCorners: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  return collisions.length ? collisions : closestCorners(args);
};

export const KanbanBoard = ({ boardId, onBoardRenamed, onSessionExpired }: KanbanBoardProps) => {
  const boardUrl = `/api/boards/${boardId}`;
  const [board, setBoard] = useState<BoardData | null>(null);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<BoardData | null>(null);
  const [conflict, setConflict] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [filter, setFilter] = useState(emptyFilter);
  const requestController = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const expired = useRef(onSessionExpired);
  useEffect(() => { expired.current = onSessionExpired; }, [onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    async function load() {
      try {
        const [data, people] = await Promise.all([
          api<BoardData>(boardUrl, undefined, controller.signal),
          api<string[]>(`${boardUrl}/participants`, undefined, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setBoard(data); setParticipants(people); setError(null); setUnsaved(null); setConflict(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          if (cause instanceof ApiError && cause.status === 401) expired.current?.("Your session expired. Sign in again.");
          setError("Unable to load the board. Retry to load your saved data.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [loadAttempt, boardUrl]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const readOnly = board?.role === "viewer";
  const disabled = isLoading || isSaving || isAiBusy || !!unsaved || conflict || readOnly;
  // An open editor holds a copy of its card, so the assistant must not change the board underneath it.
  const editorOpen = !!(editingCardId && board?.cards[editingCardId]);
  const aiDisabled = disabled || editorOpen;

  // Session expiry unmounts the board, so the lost-work notice travels with it to the sign-in screen.
  const reportFailure = (cause: unknown, fallback: string, expiredMessage: string) => {
    if (cause instanceof ApiError && cause.status === 401) expired.current?.(expiredMessage);
    if (cause instanceof ApiError && cause.status === 409) setConflict(true);
    setError(cause instanceof ApiError ? cause.message : fallback);
  };

  const saveBoard = async (next: BoardData, focusId?: string) => {
    if (busy.current || requestController.current?.signal.aborted) return;
    busy.current = true;
    setIsSaving(true);
    setBoard(next);
    const signal = requestController.current?.signal;
    try {
      const saved = await api<BoardData>(boardUrl, { board: next }, signal);
      if (!signal?.aborted) {
        setBoard(saved); setUnsaved(null); setError(null);
        if (saved.name !== board?.name) onBoardRenamed?.(saved.name);
        if (focusId) requestAnimationFrame(() => {
          if (!signal?.aborted) document.getElementById(focusId)?.focus();
        });
      }
    } catch (cause) {
      if (!signal?.aborted) {
        setUnsaved(next);
        reportFailure(cause, "Unable to save. Your edits are kept here; retry or reload the saved board.",
          "Your session expired, so your last change was not saved. Sign in again and redo it.");
      }
    } finally {
      if (!signal?.aborted) { busy.current = false; setIsSaving(false); }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCardId(null);
    const { active, over } = event;
    if (!board || disabled || busy.current || !over || active.id === over.id) return;
    // Dropped below the middle of the target card means "place after it".
    const dragged = active.rect.current.translated;
    const placeAfter = !!dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
    void saveBoard({ ...board, columns: moveCard(board.columns, String(active.id), String(over.id), placeAfter) }, `drag-${active.id}`);
  };
  const handleRenameBoard = (name: string) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, name });
  };
  const handleRenameColumn = (id: string, title: string) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, columns: board.columns.map(c => c.id === id ? { ...c, title } : c) });
  };
  const handleAddColumn = (title: string) => {
    if (!board || disabled || busy.current || board.columns.length >= MAX_COLUMNS) return;
    void saveBoard({ ...board, columns: [...board.columns, { id: createId("col"), title, cardIds: [] }] }, "new-column-title");
  };
  const handleShiftColumn = (id: string, offset: -1 | 1) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, columns: shiftColumn(board.columns, id, offset) }, `column-title-${id}`);
  };
  const handleDeleteColumn = (id: string) => {
    if (!board || disabled || busy.current || board.columns.find(c => c.id === id)?.cardIds.length) return;
    void saveBoard({ ...board, columns: board.columns.filter(c => c.id !== id) }, "new-column-title");
  };
  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (!board || disabled || busy.current) return;
    const id = createId("card");
    void saveBoard({ ...board, cards: { ...board.cards, [id]: { id, title, details, dueDate: null, priority: null, labels: [], assignee: null } },
      columns: board.columns.map(c => c.id === columnId ? { ...c, cardIds: [...c.cardIds, id] } : c) });
  };
  const handleEditCard = (id: string, changes: CardChanges) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, cards: { ...board.cards, [id]: { ...board.cards[id], ...changes } } }, `edit-${id}`);
  };
  const handleMoveCard = (cardId: string, columnId: string) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, columns: moveCard(board.columns, cardId, columnId) }, `move-${cardId}`);
  };
  const handleDeleteCard = (columnId: string, id: string) => {
    if (!board || disabled || busy.current) return;
    void saveBoard({ ...board, cards: Object.fromEntries(Object.entries(board.cards).filter(([key]) => key !== id)),
      columns: board.columns.map(c => ({ ...c, cardIds: c.cardIds.filter(key => key !== id) })) }, `column-title-${columnId}`);
  };
  const reload = () => { setIsLoading(true); setLoadAttempt(current => current + 1); };

  const handleAiSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = aiPrompt.trim();
    if (!board || !prompt || aiDisabled || busy.current) return;
    busy.current = true; setIsAiBusy(true); setError(null);
    const userMessage: ChatMessage = { id: createId("chat"), role: "user", content: prompt };
    const nextConversation = [...conversation, userMessage];
    setConversation(nextConversation); setAiPrompt("");
    const signal = requestController.current?.signal;
    try {
      const result = await api<{ response: string; board: BoardData }>(`${boardUrl}/ai`, {
        prompt, revision: board.revision,
        conversation: conversation.slice(-20).map(({ role, content }) => ({ role, content })),
      }, signal);
      if (!signal?.aborted) {
        setBoard(result.board);
        setConversation(current => [...current, { id: createId("chat"), role: "assistant", content: result.response }]);
      }
    } catch (cause) {
      if (!signal?.aborted) {
        // The prompt returns to the input for retry, so drop it from the transcript and history.
        setConversation(current => current.filter(message => message.id !== userMessage.id));
        setAiPrompt(prompt);
        reportFailure(cause, "The assistant request did not complete. Reload the board before retrying if the connection was lost.",
          "Your session expired, so the assistant's changes were not saved. Sign in again and resend your message.");
      }
    } finally {
      if (!signal?.aborted) { busy.current = false; setIsAiBusy(false); }
    }
  };

  if (!board) {
    return <main className="p-8">
      {isLoading ? <p role="status">Loading board...</p> : <><p role="alert">{error}</p><button onClick={reload}>Retry loading board</button></>}
    </main>;
  }
  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const filtering = isFilterActive(filter);
  const today = todayIso();
  const allCards = Object.values(board.cards);
  const visible = (cardId: string) => !filtering || matchesFilter(board.cards[cardId], filter, today);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex max-w-[1800px] flex-col gap-6 px-6 pb-16 pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <input
            key={board.name}
            defaultValue={board.name}
            disabled={disabled}
            maxLength={100}
            aria-label="Board name"
            onBlur={(event) => {
              const name = event.target.value.trim();
              if (name && name !== board.name) handleRenameBoard(name);
              else event.target.value = board.name;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.value = board.name;
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            className="min-w-0 flex-1 bg-transparent font-display text-3xl font-semibold text-[var(--navy-dark)] outline-none disabled:cursor-default disabled:opacity-100"
          />
          {!readOnly && board.columns.length < MAX_COLUMNS && (
            <form className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.namedItem("title") as HTMLInputElement;
                const title = input.value.trim();
                if (title) { handleAddColumn(title); input.value = ""; }
              }}>
              <input id="new-column-title" name="title" maxLength={200} disabled={disabled} required
                aria-label="New column title" placeholder="New column"
                className="w-40 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
              <button type="submit" disabled={disabled}
                className="rounded-full border border-dashed border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]">
                Add column
              </button>
            </form>
          )}
          {readOnly && (
            <span className="rounded-full border border-[var(--stroke)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              View only
            </span>
          )}
        </div>

        <BoardFilters filter={filter} onChange={setFilter} labels={boardLabels(allCards)} participants={participants}
          shown={allCards.filter(card => visible(card.id)).length} total={allCards.length} />

        {error ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
            {unsaved && !conflict && <button disabled={isSaving} onClick={() => void saveBoard(unsaved)} className="ml-3 underline">Retry save</button>}
            <button disabled={isSaving || isAiBusy} onClick={reload} className="ml-3 underline">{unsaved ? "Discard local edits and reload" : "Reload saved board"}</button>
          </div>
        ) : null}

        {isLoading ? (
          <div role="status" className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm text-[var(--gray-text)]">
            Loading board...
          </div>
        ) : null}

        {isSaving && <p role="status">Saving board...</p>}
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithinOrClosestCorners}
            onDragStart={(event) => { if (!disabled) setActiveCardId(String(event.active.id)); }}
            onDragCancel={() => setActiveCardId(null)}
            onDragEnd={handleDragEnd}
          >
            <section aria-label="Board columns" className="flex items-start gap-6 overflow-x-auto pb-4">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.filter(visible).map((cardId) => board.cards[cardId])}
                  filtered={filtering}
                  dragDisabled={filtering}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                  onMoveCard={handleMoveCard}
                  onShift={handleShiftColumn}
                  onDeleteColumn={handleDeleteColumn}
                  columns={board.columns}
                  participants={participants}
                  disabled={disabled}
                  editingCardId={editingCardId}
                  onEditingChange={setEditingCardId}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <aside className="rounded-[28px] border border-[var(--stroke)] bg-white/80 p-5 shadow-[var(--shadow)] backdrop-blur">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                AI assistant
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[var(--navy-dark)]">
                Board help
              </h2>
            </div>

            <div
              role="log"
              aria-label="Assistant conversation"
              aria-live="polite"
              className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1"
            >
              {conversation.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-[var(--secondary-purple)] px-3 py-2 text-sm text-white" : "mr-auto max-w-[85%] rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"}
                >
                  {message.content}
                </div>
              ))}
            </div>

            {editorOpen && (
              <p className="mt-4 text-sm text-[var(--gray-text)]">Save or cancel the open card edit to use the assistant.</p>
            )}
            <form onSubmit={handleAiSubmit} className="mt-4 flex gap-2">
              <input
                aria-label="Message to board assistant"
                maxLength={2000}
                disabled={aiDisabled}
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="Ask the board assistant..."
                className="min-w-0 flex-1 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                disabled={aiDisabled}
                className="rounded-2xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAiBusy ? "Working..." : "Send"}
              </button>
            </form>
          </aside>
        </div>
      </main>
    </div>
  );
};
