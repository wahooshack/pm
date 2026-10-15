export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  dueDate: string | null;
  priority: Priority | null;
  labels: string[];
  assignee: string | null;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type Role = "owner" | "editor" | "viewer";

export type BoardData = {
  id: number;
  name: string;
  role: Role;
  revision: number;
  columns: Column[];
  cards: Record<string, Card>;
};

export type BoardSummary = { id: number; name: string; role: Role; owner: string };

const isColumnId = (columns: Column[], id: string) =>
  columns.some(
    (column) => column.id === id || `${column.id}-empty-zone` === id
  );

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    const exact = columns.find((column) => column.id === id);
    if (exact) {
      return exact.id;
    }
    return columns.find((column) => `${column.id}-empty-zone` === id)?.id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string,
  placeAfter = false
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);
  const normalizedOverId = isOverColumn ? overColumnId : overId;

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter((cardId) => cardId !== activeId);
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const targetIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || targetIndex === -1 || oldIndex === targetIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);

    const insertIndex = targetIndex === activeColumn.cardIds.length - 1
      ? nextCardIds.length
      : targetIndex;

    nextCardIds.splice(insertIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = activeColumn.cardIds.filter((cardId) => cardId !== activeId);
  const nextOverCardIds = overColumn.cardIds.filter((cardId) => cardId !== activeId);
  const isEmptyTarget = nextOverCardIds.length === 0 && isOverColumn;

  if (isEmptyTarget || isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(normalizedOverId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex + (placeAfter ? 1 : 0);

    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};

export const MAX_COLUMNS = 20;

export const shiftColumn = (columns: Column[], columnId: string, offset: -1 | 1): Column[] => {
  const index = columns.findIndex((column) => column.id === columnId);
  const target = index + offset;
  if (index === -1 || target < 0 || target >= columns.length) {
    return columns;
  }
  const next = [...columns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
