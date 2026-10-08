"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, initialData, moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void;
};

const API_USERNAME = "user";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const pointerWithinOrClosestCorners: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

const saveBoardToBackend = async (board: BoardData) => {
  const response = await fetch("/api/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: API_USERNAME, board }),
  });

  if (!response.ok) {
    throw new Error("Unable to save the board.");
  }

  return (await response.json()) as BoardData;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialData);
  const [conversation, setConversation] = useState<ChatMessage[]>([
    {
      id: createId("chat"),
      role: "assistant",
      content: "Hi! Ask me to move, rename, or add cards on the board.",
    },
  ]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadBoard = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/board?username=${encodeURIComponent(API_USERNAME)}`);

        if (!response.ok) {
          throw new Error("Unable to load the board.");
        }

        const data = (await response.json()) as BoardData;

        if (isActive) {
          setBoard(data);
          setError(null);
        }
      } catch {
        if (isActive) {
          setError("Unable to load the board. Showing the last local copy.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadBoard();

    return () => {
      isActive = false;
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const queueBoardSave = async (nextBoard: BoardData) => {
    setBoard(nextBoard);
    try {
      const savedBoard = await saveBoardToBackend(nextBoard);
      setBoard(savedBoard);
      setError(null);
    } catch {
      setError("Unable to save the board. Your latest changes may not be persisted.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const nextBoard = {
      ...board,
      columns: moveCard(board.columns, active.id as string, over.id as string),
    };

    void queueBoardSave(nextBoard);
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    const nextBoard = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    };

    void queueBoardSave(nextBoard);
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    const nextBoard = {
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details: details || "No details yet." },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    };

    void queueBoardSave(nextBoard);
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    const nextBoard = {
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: column.cardIds.filter((id) => id !== cardId),
            }
          : column
      ),
    };

    void queueBoardSave(nextBoard);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  const handleAiSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = aiPrompt.trim();
    if (!trimmed || isAiBusy) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId("chat"),
      role: "user",
      content: trimmed,
    };

    const nextConversation = [...conversation, userMessage];
    setConversation(nextConversation);
    setAiPrompt("");
    setIsAiBusy(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          board,
          conversation: nextConversation,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed.");
      }

      const payload = (await response.json()) as {
        response: string;
        board?: BoardData;
        actions?: Array<Record<string, unknown>>;
      };

      const assistantMessage: ChatMessage = {
        id: createId("chat"),
        role: "assistant",
        content: payload.response || "I processed that request.",
      };

      setConversation((current) => [...current, assistantMessage]);

      if (payload.board && JSON.stringify(payload.board) !== JSON.stringify(board)) {
        const savedBoard = await saveBoardToBackend(payload.board);
        setBoard(savedBoard);
        setError(null);
      }
    } catch {
      setConversation((current) => [
        ...current,
        {
          id: createId("chat"),
          role: "assistant",
          content: "I couldn’t process that request right now.",
        },
      ]);
      setError("The assistant couldn’t complete the request.");
    } finally {
      setIsAiBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                >
                  Log out
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        {error ? (
          <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div role="status" className="rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3 text-sm text-[var(--gray-text)]">
            Loading board...
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithinOrClosestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId]).filter(Boolean)}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
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

            <form onSubmit={handleAiSubmit} className="mt-4 flex gap-2">
              <input
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="Ask the board assistant..."
                className="flex-1 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2 text-sm outline-none transition focus:border-[var(--primary-blue)]"
              />
              <button
                type="submit"
                disabled={isAiBusy}
                className="rounded-2xl bg-[var(--primary-blue)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
