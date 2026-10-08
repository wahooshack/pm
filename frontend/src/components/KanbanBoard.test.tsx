import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import Home from "@/app/page";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const defaultBoard = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "Draft quarterly themes with impact statements and metrics." },
    "card-2": { id: "card-2", title: "Gather customer signals", details: "Review support tags, sales notes, and churn feedback." },
    "card-3": { id: "card-3", title: "Prototype analytics view", details: "Sketch initial dashboard layout and key drill-downs." },
    "card-4": { id: "card-4", title: "Refine status language", details: "Standardize column labels and tone across the board." },
    "card-5": { id: "card-5", title: "Design card layout", details: "Add hierarchy and spacing for scanning dense lists." },
    "card-6": { id: "card-6", title: "QA micro-interactions", details: "Verify hover, focus, and loading states." },
    "card-7": { id: "card-7", title: "Ship marketing page", details: "Final copy approved and asset pack delivered." },
    "card-8": { id: "card-8", title: "Close onboarding sprint", details: "Document release notes and share internally." },
  },
};

describe("KanbanBoard", () => {
  let boardState: typeof defaultBoard;

  beforeEach(() => {
    window.sessionStorage.clear();
    boardState = JSON.parse(JSON.stringify(defaultBoard));
    global.fetch = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        boardState = payload.board;
        return {
          ok: true,
          json: async () => payload.board,
        } as Response;
      }

      return {
        ok: true,
        json: async () => boardState,
      } as Response;
    }) as typeof fetch;
  });

  it("renders five columns", async () => {
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("sends board context to the assistant and saves its valid board update", async () => {
    const nextBoard = JSON.parse(JSON.stringify(defaultBoard)) as typeof defaultBoard;
    nextBoard.columns[0].cardIds = ["card-2"];
    nextBoard.columns[1].cardIds = ["card-3", "card-1"];
    let aiRequest: Record<string, unknown> | undefined;
    global.fetch = vi.fn(async (input, init) => {
      if (String(input) === "/api/ai") {
        aiRequest = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({
            response: "Moved Align roadmap themes to Discovery.",
            model: "mock-model",
            board: nextBoard,
            actions: [
              {
                type: "move_card",
                cardId: "card-1",
                columnId: "col-discovery",
              },
            ],
          }),
        } as Response;
      }

      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        boardState = payload.board;
        return {
          ok: true,
          json: async () => payload.board,
        } as Response;
      }

      return {
        ok: true,
        json: async () => boardState,
      } as Response;
    }) as typeof fetch;

    render(<KanbanBoard />);
    const input = screen.getByPlaceholderText("Ask the board assistant...");
    await userEvent.type(input, "Move Align roadmap themes to Discovery");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Moved Align roadmap themes to Discovery.")).toBeInTheDocument();
      expect(
        within(screen.getByTestId("column-col-discovery")).getByTestId("card-card-1")
      ).toBeInTheDocument();
    });

    expect(aiRequest).toMatchObject({
      prompt: "Move Align roadmap themes to Discovery",
      board: defaultBoard,
    });
    expect(aiRequest?.conversation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Move Align roadmap themes to Discovery",
        }),
      ])
    );
    expect(boardState.columns[0].cardIds).toEqual(["card-2"]);
    expect(boardState.columns[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("shows no-op assistant responses without saving an unchanged board", async () => {
    const fetchMock = vi.fn(async (input) => {
      if (String(input) === "/api/ai") {
        return {
          ok: true,
          json: async () => ({
            response: "No changes are needed.",
            model: "mock-model",
            board: JSON.parse(JSON.stringify(boardState)),
            actions: [],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => boardState,
      } as Response;
    });
    global.fetch = fetchMock as typeof fetch;

    render(<KanbanBoard />);
    await userEvent.type(
      screen.getByPlaceholderText("Ask the board assistant..."),
      "Is anything urgent?"
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("No changes are needed.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("requires a valid login before showing the board", async () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Username"));
    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.clear(screen.getByLabelText("Password"));
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    });
  });

  it("logs out and returns to the login screen", async () => {
    window.sessionStorage.setItem("kanban-demo-auth", "authenticated");
    render(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
