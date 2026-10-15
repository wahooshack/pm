import { moveCard, shiftColumn, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("places a card before or after a card in another column", () => {
    const before = moveCard(baseColumns, "card-2", "card-3");
    expect(before[0].cardIds).toEqual(["card-1"]);
    expect(before[1].cardIds).toEqual(["card-2", "card-3"]);
    const after = moveCard(baseColumns, "card-2", "card-3", true);
    expect(after[1].cardIds).toEqual(["card-3", "card-2"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("moves a card into an empty column", () => {
    const emptyColumns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: [] },
    ];

    const result = moveCard(emptyColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual([]);
    expect(result[1].cardIds).toEqual(["card-1"]);
  });

  it("moves a card into an empty column when the empty-zone droppable id is used", () => {
    const emptyColumns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: [] },
    ];

    const result = moveCard(emptyColumns, "card-1", "col-b-empty-zone");
    expect(result[0].cardIds).toEqual([]);
    expect(result[1].cardIds).toEqual(["card-1"]);
  });
});

describe("shiftColumn", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: [] },
    { id: "col-b", title: "B", cardIds: ["card-1"] },
    { id: "col-c", title: "C", cardIds: [] },
  ];

  it("swaps a column with its neighbour", () => {
    expect(shiftColumn(columns, "col-b", -1).map((column) => column.id)).toEqual(["col-b", "col-a", "col-c"]);
    expect(shiftColumn(columns, "col-b", 1).map((column) => column.id)).toEqual(["col-a", "col-c", "col-b"]);
  });

  it("leaves the order unchanged at the edges or for unknown columns", () => {
    expect(shiftColumn(columns, "col-a", -1)).toBe(columns);
    expect(shiftColumn(columns, "col-c", 1)).toBe(columns);
    expect(shiftColumn(columns, "missing", 1)).toBe(columns);
  });
});
