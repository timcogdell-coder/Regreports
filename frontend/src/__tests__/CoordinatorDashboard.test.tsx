import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import CoordinatorDashboard from "../components/Dashboard/CoordinatorDashboard";
import * as client from "../api/client";

jest.mock("../api/client");
const mocks = {
  getPendingEnforcement: client.getPendingEnforcement as jest.MockedFunction<typeof client.getPendingEnforcement>,
  approveEnforcement:    client.approveEnforcement    as jest.MockedFunction<typeof client.approveEnforcement>,
  getViolations:         client.getViolations         as jest.MockedFunction<typeof client.getViolations>,
  getCompanies:          client.getCompanies          as jest.MockedFunction<typeof client.getCompanies>,
  getSamplingSchedule:   client.getSamplingSchedule   as jest.MockedFunction<typeof client.getSamplingSchedule>,
  logout:                client.logout                as jest.MockedFunction<typeof client.logout>,
};

const COORD_USER = {
  id: 99, username: "coord", email: "coord@example.com",
  role: "coordinator", company_id: null,
};

const COMPANIES = [
  { id: 1, name: "Kraft Heinz" },
  { id: 2, name: "Cal-Maine" },
];

const ACTIONS = [
  {
    id: 10, violation_id: 5, company_id: 1,
    response_level: "warning_letter",
    auto_generated_response: "Dear Kraft Heinz, you have exceeded your BOD limit.",
    fine_amount: 0, status: "pending", created_at: "2026-05-01",
  },
  {
    id: 11, violation_id: 6, company_id: 2,
    response_level: "consent_order",
    auto_generated_response: "Cal-Maine compliance order text.",
    fine_amount: 500.00, status: "pending", created_at: "2026-05-02",
  },
];

const VIOLATIONS = [
  {
    id: 1, company_id: 1, parameter_name: "BOD", violation_type: "max_exceeds",
    violation_date: "2026-05-01", violation_severity: "major", exceedance_percent: 50.0,
  },
  {
    id: 2, company_id: 2, parameter_name: "TSS", violation_type: "avg_exceeds",
    violation_date: "2026-05-03", violation_severity: "minor", exceedance_percent: 10.5,
  },
];

const SCHEDULE = [
  {
    company_name: "Kraft Heinz", permit_number: "004", parameter_name: "BOD",
    frequency_description: "Monthly", sample_type: "composite",
    last_sample_date: "2026-04-01", next_due_date: "2026-05-01",
    status: "overdue", days_overdue: 5,
  },
  {
    company_name: "Cal-Maine", permit_number: "007", parameter_name: "pH",
    frequency_description: "Quarterly", sample_type: "grab",
    last_sample_date: null, next_due_date: "2026-06-01",
    status: "current", days_overdue: null,
  },
];

function setupDefaultMocks() {
  mocks.getPendingEnforcement.mockResolvedValue({ data: ACTIONS } as any);
  mocks.getViolations.mockResolvedValue({ data: VIOLATIONS } as any);
  mocks.getCompanies.mockResolvedValue({ data: COMPANIES } as any);
  mocks.getSamplingSchedule.mockResolvedValue({ data: SCHEDULE } as any);
  mocks.approveEnforcement.mockResolvedValue({} as any);
  mocks.logout.mockResolvedValue({} as any);
}

async function renderLoaded(onLogout = jest.fn()) {
  setupDefaultMocks();
  const user = userEvent.setup();
  render(<CoordinatorDashboard user={COORD_USER} onLogout={onLogout} />);
  await waitFor(() =>
    expect(screen.queryByText("Loading data…")).not.toBeInTheDocument()
  );
  return { user, onLogout };
}

// ── Initial state ──────────────────────────────────────────────────────────────

describe("CoordinatorDashboard — initial state", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows loading indicator while data is fetching", () => {
    mocks.getPendingEnforcement.mockReturnValue(new Promise(() => {}) as any);
    mocks.getViolations.mockReturnValue(new Promise(() => {}) as any);
    mocks.getCompanies.mockReturnValue(new Promise(() => {}) as any);
    mocks.getSamplingSchedule.mockReturnValue(new Promise(() => {}) as any);
    render(<CoordinatorDashboard user={COORD_USER} onLogout={jest.fn()} />);
    expect(screen.getByText("Loading data…")).toBeInTheDocument();
  });

  test("shows header with brand, Coordinator badge, and Sign Out button", async () => {
    await renderLoaded();
    expect(screen.getByText("Regreports PIMS")).toBeInTheDocument();
    expect(screen.getByText("Coordinator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  test("shows three navigation tabs", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /pending approvals/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /violations/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /schedule/i })).toBeInTheDocument();
  });

  test("default tab is Pending Approvals", async () => {
    await renderLoaded();
    expect(screen.getByText(/WARNING LETTER/i)).toBeInTheDocument();
  });

  test("fetches all four data sources on mount", async () => {
    await renderLoaded();
    expect(mocks.getPendingEnforcement).toHaveBeenCalled();
    expect(mocks.getViolations).toHaveBeenCalled();
    expect(mocks.getCompanies).toHaveBeenCalled();
    expect(mocks.getSamplingSchedule).toHaveBeenCalled();
  });

  test("shows fetch error banner when an API call fails", async () => {
    mocks.getPendingEnforcement.mockRejectedValue({
      response: { data: { error: "Database unavailable" } },
    });
    mocks.getViolations.mockResolvedValue({ data: [] } as any);
    mocks.getCompanies.mockResolvedValue({ data: [] } as any);
    mocks.getSamplingSchedule.mockResolvedValue({ data: [] } as any);
    render(<CoordinatorDashboard user={COORD_USER} onLogout={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/data load error/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Database unavailable/)).toBeInTheDocument();
  });
});

// ── Pending Approvals tab ──────────────────────────────────────────────────────

describe("CoordinatorDashboard — pending approvals", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows action cards with response level and company name", async () => {
    await renderLoaded();
    expect(screen.getByText(/WARNING LETTER/i)).toBeInTheDocument();
    expect(screen.getByText(/CONSENT ORDER/i)).toBeInTheDocument();
    expect(screen.getByText(/Kraft Heinz/)).toBeInTheDocument();
    expect(screen.getByText(/Cal-Maine/)).toBeInTheDocument();
  });

  test("shows fine amount on action card when fine_amount > 0", async () => {
    await renderLoaded();
    expect(screen.getByText("$500.00")).toBeInTheDocument();
  });

  test("shows pending count in tab label", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /pending approvals.*2/i })).toBeInTheDocument();
  });

  test("shows 'No pending enforcement actions' when list is empty", async () => {
    setupDefaultMocks();
    mocks.getPendingEnforcement.mockResolvedValue({ data: [] } as any);
    render(<CoordinatorDashboard user={COORD_USER} onLogout={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText("No pending enforcement actions.")).toBeInTheDocument()
    );
  });

  test("clicking an action card opens the detail pane", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    expect(screen.getByText(/review enforcement action #10/i)).toBeInTheDocument();
    expect(
      screen.getByText("Dear Kraft Heinz, you have exceeded your BOD limit.")
    ).toBeInTheDocument();
  });

  test("Approve & Send button is disabled without a signature", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    expect(screen.getByRole("button", { name: /approve & send/i })).toBeDisabled();
  });

  test("Approve & Send is enabled after typing a signature", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    await user.type(
      screen.getByPlaceholderText(/full name as electronic signature/i),
      "Jane Smith"
    );
    expect(screen.getByRole("button", { name: /approve & send/i })).toBeEnabled();
  });

  test("Cancel button closes the detail pane", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByText(/review enforcement action/i)).not.toBeInTheDocument();
  });

  test("approving calls approveEnforcement with id, notes, and signature", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    await user.type(
      screen.getByPlaceholderText(/add notes or modifications/i),
      "No further action needed."
    );
    await user.type(
      screen.getByPlaceholderText(/full name as electronic signature/i),
      "Jane Smith"
    );
    await user.click(screen.getByRole("button", { name: /approve & send/i }));
    await waitFor(() =>
      expect(mocks.approveEnforcement).toHaveBeenCalledWith(10, {
        notes: "No further action needed.",
        e_signature: "Jane Smith",
      })
    );
  });

  test("detail pane closes after successful approval", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByText(/WARNING LETTER/i).closest("div")!);
    await user.type(
      screen.getByPlaceholderText(/full name as electronic signature/i),
      "Jane Smith"
    );
    await user.click(screen.getByRole("button", { name: /approve & send/i }));
    await waitFor(() =>
      expect(screen.queryByText(/review enforcement action/i)).not.toBeInTheDocument()
    );
  });
});

// ── Violations tab ─────────────────────────────────────────────────────────────

describe("CoordinatorDashboard — violations tab", () => {
  beforeEach(() => jest.clearAllMocks());

  async function goToViolations() {
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: /violations/i }));
    return { user };
  }

  test("violations tab shows count in label", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /violations.*2/i })).toBeInTheDocument();
  });

  test("shows violations table with date, company, parameter, and severity", async () => {
    await goToViolations();
    expect(screen.getByText("2026-05-01")).toBeInTheDocument();
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.getByText("major")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
  });

  test("company filter dropdown lists all companies", async () => {
    const { user } = await goToViolations();
    const select = screen.getAllByRole("combobox")[0];
    expect(within(select).getByText("Kraft Heinz")).toBeInTheDocument();
    expect(within(select).getByText("Cal-Maine")).toBeInTheDocument();
  });

  test("selecting a company filters violations client-side", async () => {
    const { user } = await goToViolations();
    const select = screen.getAllByRole("combobox")[0];
    await user.selectOptions(select, "1"); // Kraft Heinz
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.queryByText("TSS")).not.toBeInTheDocument();
    expect(screen.getByText("1 violation")).toBeInTheDocument();
  });

  test("Clear filter button resets the filter", async () => {
    const { user } = await goToViolations();
    await user.selectOptions(screen.getAllByRole("combobox")[0], "1");
    await user.click(screen.getByRole("button", { name: /clear filter/i }));
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.getByText("TSS")).toBeInTheDocument();
    expect(screen.getByText("2 violations")).toBeInTheDocument();
  });

  test("shows 'No violations' message when none exist", async () => {
    setupDefaultMocks();
    mocks.getViolations.mockResolvedValue({ data: [] } as any);
    const user = userEvent.setup();
    render(<CoordinatorDashboard user={COORD_USER} onLogout={jest.fn()} />);
    await waitFor(() =>
      expect(screen.queryByText("Loading data…")).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: /violations/i }));
    expect(screen.getByText(/no violations on record/i)).toBeInTheDocument();
  });
});

// ── Schedule tab ───────────────────────────────────────────────────────────────

describe("CoordinatorDashboard — schedule tab", () => {
  beforeEach(() => jest.clearAllMocks());

  async function goToSchedule() {
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: /schedule/i }));
    return { user };
  }

  test("schedule tab label shows overdue count when there are overdue items", async () => {
    await renderLoaded();
    expect(screen.getByRole("button", { name: /schedule.*1 overdue/i })).toBeInTheDocument();
  });

  test("shows schedule table rows with company, parameter, and status", async () => {
    await goToSchedule();
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.getByText("pH")).toBeInTheDocument();
    expect(screen.getByText(/overdue 5d/i)).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  test("shows 'Never' for parameters with no last sample date", async () => {
    await goToSchedule();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  test("shows overdue and current summary chips", async () => {
    await goToSchedule();
    expect(screen.getByText("1 Overdue")).toBeInTheDocument();
    expect(screen.getByText("1 Current")).toBeInTheDocument();
  });

  test("company filter calls getSamplingSchedule with the selected companyId", async () => {
    const { user } = await goToSchedule();
    const selects = screen.getAllByRole("combobox");
    const scheduleSelect = selects[selects.length - 1];
    await user.selectOptions(scheduleSelect, "1");
    await waitFor(() =>
      expect(mocks.getSamplingSchedule).toHaveBeenCalledWith(1)
    );
  });

  test("clear filter resets schedule to all companies", async () => {
    const { user } = await goToSchedule();
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[selects.length - 1], "1");
    const callsAfterFilter = mocks.getSamplingSchedule.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /clear filter/i }));
    await waitFor(() =>
      expect(mocks.getSamplingSchedule.mock.calls.length).toBeGreaterThan(callsAfterFilter)
    );
    const lastArgs = mocks.getSamplingSchedule.mock.lastCall ?? [];
    expect(lastArgs[0]).toBeUndefined();
  });
});

// ── Sign out ───────────────────────────────────────────────────────────────────

describe("CoordinatorDashboard — sign out", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Sign Out calls logout API and then onLogout", async () => {
    const onLogout = jest.fn();
    const { user } = await renderLoaded(onLogout);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
