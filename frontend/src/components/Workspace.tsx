"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MembersPanel } from "@/components/MembersPanel";
import { api, ApiError, type User } from "@/lib/api";
import type { BoardData, BoardSummary } from "@/lib/kanban";

const LAST_BOARD_KEY = "pm-last-board";

// Remembering the last board is a convenience only; the server decides what the user may open.
const readLastBoard = () => {
  try { return Number(window.localStorage.getItem(LAST_BOARD_KEY)); } catch { return 0; }
};
const writeLastBoard = (id: number) => {
  try { window.localStorage.setItem(LAST_BOARD_KEY, String(id)); } catch { /* storage unavailable */ }
};

type WorkspaceProps = { user: User; onLogout: () => void; onSessionExpired: (message: string) => void };

export const Workspace = ({ user, onLogout, onSessionExpired }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  // Remounting the board reloads it, so member changes reach the assignee list.
  const [boardVersion, setBoardVersion] = useState(0);
  const expired = useRef(onSessionExpired);
  useEffect(() => { expired.current = onSessionExpired; }, [onSessionExpired]);
  const sessionExpired = useCallback(() => expired.current("Your session expired. Sign in again."), []);

  const select = (id: number | null) => {
    setCurrentId(id); setSharing(false);
    if (id) writeLastBoard(id);
  };

  useEffect(() => {
    const controller = new AbortController();
    api<BoardSummary[]>("/api/boards", undefined, controller.signal).then(list => {
      if (controller.signal.aborted) return;
      setBoards(list); setError(null);
      const last = readLastBoard();
      setCurrentId(list.some(board => board.id === last) ? last : list[0]?.id ?? null);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 401) expired.current("Your session expired. Sign in again.");
      setError("Unable to load your boards.");
    });
    return () => controller.abort();
  }, [loadAttempt]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true); setError(null);
    try {
      await action();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired.current("Your session expired. Sign in again.");
      setError(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const createBoard = (name: string) => run(async () => {
    const board = await api<BoardData>("/api/boards", { name });
    setBoards(current => [...(current ?? []), { id: board.id, name: board.name, role: "owner", owner: user.username }]);
    select(board.id);
  }, "Unable to create the board.");

  const deleteBoard = () => {
    const current = boards?.find(board => board.id === currentId);
    if (!current || !window.confirm(`Delete board "${current.name}" and all its cards? This cannot be undone.`)) return;
    void run(async () => {
      await api(`/api/boards/${current.id}`, {}, undefined, "DELETE");
      const rest = (boards ?? []).filter(board => board.id !== current.id);
      setBoards(rest);
      select(rest[0]?.id ?? null);
    }, "Unable to delete the board.");
  };

  const renamed = (name: string) =>
    setBoards(current => current?.map(board => board.id === currentId ? { ...board, name } : board) ?? null);

  return (
    <div className="min-h-screen">
      <AppHeader user={user} boards={boards ?? []} currentId={currentId} busy={busy || !boards}
        onSelect={select} onCreate={name => void createBoard(name)} onDelete={deleteBoard} onShare={() => setSharing(true)} onLogout={onLogout} />
      {sharing && currentId !== null && (
        <MembersPanel boardId={currentId} boardName={boards?.find(board => board.id === currentId)?.name ?? ""}
          onSessionExpired={sessionExpired}
          onClose={changed => { setSharing(false); if (changed) setBoardVersion(version => version + 1); }} />
      )}
      {error && (
        <div role="alert" className="mx-auto mt-4 max-w-[1800px] px-6">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
            {!boards && <button onClick={() => setLoadAttempt(attempt => attempt + 1)} className="ml-3 underline">Retry</button>}
          </p>
        </div>
      )}
      {!boards && !error && <p role="status" className="p-8">Loading boards...</p>}
      {boards && currentId === null && (
        <p className="mx-auto max-w-[1800px] px-6 py-12 text-[var(--gray-text)]">You have no boards yet. Create one with New board.</p>
      )}
      {currentId !== null && (
        <KanbanBoard key={`${currentId}-${boardVersion}`} boardId={currentId} onBoardRenamed={renamed} onSessionExpired={onSessionExpired} />
      )}
    </div>
  );
};
