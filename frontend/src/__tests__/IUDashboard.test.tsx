import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import IUDashboard from "../components/Dashboard/IUDashboard";
import * as client from "../api/client";
import api from "../api/client";

jest.mock("../api/client");
// Avoid SampleForm/MonthlyFlowForm mounting their own API calls
jest.mock("../components/Samples/SampleForm",      () => () => <div>SampleForm</div>);
jest.mock("../components/Samples/MonthlyFlowForm", () => () => <div>MonthlyFlowForm</div>);
// Avoid NotificationBell's independent polling
jest.mock("../components/NotificationBell",        () => () => null);

const mocks = {
  getSamples:          client.getSamples          as jest.MockedFunction<typeof client.getSamples>,
  getViolations:       client.getViolations       as jest.MockedFunction<typeof client.getViolations>,
  getCompanies:        client.getCompanies        as jest.MockedFunction<typeof client.getCompanies>,
  getPermit:           client.getPermit           as jest.MockedFunction<typeof client.getPermit>,
  getSamplingSchedule: client.getSamplingSchedule as jest.MockedFunction<typeof client.getSamplingSchedule>,
  getMeterReadings:    client.getMeterReadings     as jest.MockedFunction<typeof client.getMeterReadings>,
  getFlowReports:      client.getFlowReports      as jest.MockedFunction<typeof client.getFlowReports>,
  getSncReport:        client.getSncReport        as jest.MockedFunction<typeof client.getSncReport>,
  logout:              client.logout              as jest.MockedFunction<typeof client.logout>,
  deleteSample:        client.deleteSample        as jest.MockedFunction<typeof client.deleteSample>,
};
const mockApiGet = api.get as jest.Mock;

const IU_USER = { id: 3, username: "iuuser", email: "iu@example.com", role: "iu", company_id: 7 };

// Dates relative to the actual current year so violation-year filtering is always correct
const THIS_YEAR = new Date().getFullYear();

const PERMIT = {
  id: 5, company_id: 7, permit_number: "IU-004",
  effective_date: "2020-01-01",
  expiration_date: `${THIS_YEAR + 2}-12-31`,
  is_active: true,
};

const EXPIRED_PERMIT = {
  ...PERMIT,
  expiration_date: `${THIS_YEAR - 1}-01-01`,
};

const VIOLATIONS = [
  { id: 1, company_id: 7, parameter_name: "BOD", violation_type: "max_exceeds",
    violation_date: `${THIS_YEAR}-03-15`, violation_severity: "major",   exceedance_percent: 60.0 },
  { id: 2, company_id: 7, parameter_name: "TSS", violation_type: "avg_exceeds",
    violation_date: `${THIS_YEAR}-04-01`, violation_severity: "minor",   exceedance_percent: 5.0 },
];

const SCHEDULE = [
  { parameter_name: "BOD", frequency_description: "Monthly", sample_type: "composite",
    last_sample_date: `${THIS_YEAR}-03-01`, next_due_date: `${THIS_YEAR}-04-01`,
    status: "overdue", days_overdue: 55 },
  { parameter_name: "pH",  frequency_description: "Monthly", sample_type: "grab",
    last_sample_date: `${THIS_YEAR}-04-01`, next_due_date: `${THIS_YEAR}-06-01`,
    status: "current", days_overdue: null },
];

const SAMPLES = [
  { id: 101, sample_date: `${THIS_YEAR}-04-15`, review_status: "submitted",
    company_id: 7, permit_id: 5, results: [] },
];

type SetupOpts = {
  permits?:    any[];
  violations?: any[];
  schedule?:   any[];
  samples?:    any[];
};

function setupDefaultMocks({
  permits    = [PERMIT],
  violations = [],
  schedule   = [],
  samples    = SAMPLES,
}: SetupOpts = {}) {
  mocks.getSamples.mockResolvedValue({ data: samples } as any);
  mocks.getViolations.mockResolvedValue({ data: violations } as any);
  mocks.getCompanies.mockResolvedValue({ data: [{ id: 7, name: "Kraft Heinz" }] } as any);
  mocks.getSamplingSchedule.mockResolvedValue({ data: schedule } as any);
  mocks.getPermit.mockResolvedValue({ data: { ...PERMIT, limits: [] } } as any);
  mocks.getMeterReadings.mockResolvedValue({ data: [] } as any);
  mocks.getFlowReports.mockResolvedValue({ data: [] } as any);
  mocks.getSncReport.mockResolvedValue({ data: [] } as any);
  mocks.logout.mockResolvedValue({} as any);
  mockApiGet.mockImplementation((url: string) => {
    if (url === "/permits") return Promise.resolve({ data: permits });
    return Promise.resolve({ data: [] });
  });
}

async function renderLoaded(opts: SetupOpts & { onLogout?: jest.Mock; initialTab?: string } = {}) {
  const { onLogout = jest.fn(), initialTab, ...setupOpts } = opts;
  setupDefaultMocks(setupOpts);
  const user = userEvent.setup();
  render(<IUDashboard user={IU_USER} onLogout={onLogout} initialTab={initialTab as any} />);
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  return { user, onLogout };
}

// ── Initial state ──────────────────────────────────────────────────────────────

describe("IUDashboard — initial state", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows loading indicator while data is fetching", () => {
    mocks.getSamples.mockReturnValue(new Promise(() => {}) as any);
    mocks.getViolations.mockReturnValue(new Promise(() => {}) as any);
    mocks.getCompanies.mockReturnValue(new Promise(() => {}) as any);
    mocks.getSamplingSchedule.mockReturnValue(new Promise(() => {}) as any);
    mocks.getMeterReadings.mockReturnValue(new Promise(() => {}) as any);
    mocks.getFlowReports.mockReturnValue(new Promise(() => {}) as any);
    mockApiGet.mockReturnValue(new Promise(() => {}));
    render(<IUDashboard user={IU_USER} onLogout={jest.fn()} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  test("shows header with brand, role, and sign out button", async () => {
    await renderLoaded();
    expect(screen.getByText("Regreports PIMS")).toBeInTheDocument();
    expect(screen.getByText("Industrial User")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  test("shows company name badge in header", async () => {
    await renderLoaded();
    // header badge is a separate <span> containing exactly the company name
    expect(screen.getByText("Kraft Heinz")).toBeInTheDocument();
  });

  test("shows all seven navigation tabs", async () => {
    await renderLoaded();
    for (const label of ["Dashboard", "Submit", "Samples", "Violations", "Schedule", "Flow History", "SNC Status"]) {
      // Use anchored regex so "Submit" doesn't match "+ Submit New Sample", etc.
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") })).toBeInTheDocument();
    }
  });

  test("default active tab is Dashboard (home)", async () => {
    await renderLoaded();
    expect(screen.getByText(/welcome, kraft heinz/i)).toBeInTheDocument();
  });

  test("shows data load error banner when an API call fails", async () => {
    mocks.getViolations.mockRejectedValue({
      response: { data: { error: "Connection refused" } },
    });
    mocks.getSamples.mockResolvedValue({ data: [] } as any);
    mocks.getCompanies.mockResolvedValue({ data: [] } as any);
    mocks.getSamplingSchedule.mockResolvedValue({ data: [] } as any);
    mocks.getMeterReadings.mockResolvedValue({ data: [] } as any);
    mocks.getFlowReports.mockResolvedValue({ data: [] } as any);
    mockApiGet.mockResolvedValue({ data: [] });
    render(<IUDashboard user={IU_USER} onLogout={jest.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/data load error/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
  });
});

// ── Home tab — permit card ─────────────────────────────────────────────────────

describe("IUDashboard — home tab: permit card", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows permit number and Active badge when permit is valid", async () => {
    await renderLoaded();
    expect(screen.getByText("IU-004")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  test("shows days until expiry when permit is active", async () => {
    await renderLoaded();
    expect(screen.getByText(/days until expiry/i)).toBeInTheDocument();
  });

  test("shows Expired badge when permit is past its expiration date", async () => {
    await renderLoaded({ permits: [EXPIRED_PERMIT] });
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/expired.*days ago/i)).toBeInTheDocument();
  });

  test("shows 'No active permit found' when no permits exist", async () => {
    await renderLoaded({ permits: [] });
    expect(screen.getByText(/no active permit found/i)).toBeInTheDocument();
  });
});

// ── Home tab — compliance card ─────────────────────────────────────────────────

describe("IUDashboard — home tab: compliance card", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows 'Clean' when there are no violations this year", async () => {
    await renderLoaded({ violations: [] });
    expect(screen.getByText("Clean")).toBeInTheDocument();
    expect(screen.getByText(/no violations this year/i)).toBeInTheDocument();
  });

  test("shows violation count and severity chips for this year's violations", async () => {
    await renderLoaded({ violations: VIOLATIONS });
    // 2 violations total, 1 major + 1 minor
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/1 major/i)).toBeInTheDocument();
    expect(screen.getByText(/1 minor/i)).toBeInTheDocument();
  });

  test("shows plain-language violation description in home card", async () => {
    await renderLoaded({ violations: VIOLATIONS });
    expect(screen.getByText(/daily maximum exceeded/i)).toBeInTheDocument();
  });

  test("'View all violations' link navigates to violations tab", async () => {
    const { user } = await renderLoaded({ violations: VIOLATIONS });
    await user.click(screen.getByRole("button", { name: /view all violations/i }));
    expect(screen.getByRole("heading", { name: /compliance status/i })).toBeInTheDocument();
  });
});

// ── Home tab — sampling status card ───────────────────────────────────────────

describe("IUDashboard — home tab: sampling status card", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows overdue parameter when schedule has overdue items", async () => {
    await renderLoaded({ schedule: SCHEDULE });
    // Home card shows up to 5 upcoming (overdue + due_soon)
    const cards = screen.getAllByText("BOD");
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getByText(/55d overdue/i)).toBeInTheDocument();
  });

  test("shows 'All current' when no overdue or due-soon items", async () => {
    await renderLoaded({ schedule: [] });
    expect(screen.getByText(/all current/i)).toBeInTheDocument();
    expect(screen.getByText(/no overdue or upcoming samples/i)).toBeInTheDocument();
  });

  test("'+ Submit New Sample' button navigates to submit tab", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: /\+ submit new sample/i }));
    expect(screen.getByText("SampleForm")).toBeInTheDocument();
  });
});

// ── Home tab — recent submissions card ────────────────────────────────────────

describe("IUDashboard — home tab: recent submissions", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows sample date and Pending badge for unreviewed samples", async () => {
    await renderLoaded();
    expect(screen.getByText(`${THIS_YEAR}-04-15`)).toBeInTheDocument();
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  test("shows 'No submissions yet' when sample list is empty", async () => {
    await renderLoaded({ samples: [] });
    expect(screen.getByText(/no submissions yet/i)).toBeInTheDocument();
  });
});

// ── Tab navigation ─────────────────────────────────────────────────────────────

describe("IUDashboard — tab navigation", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Violations tab badge shows total violation count", async () => {
    await renderLoaded({ violations: VIOLATIONS });
    expect(screen.getByRole("button", { name: /violations.*2/i })).toBeInTheDocument();
  });

  test("Schedule tab badge shows overdue count", async () => {
    await renderLoaded({ schedule: SCHEDULE });
    // 1 overdue item → "Schedule (1)"
    expect(screen.getByRole("button", { name: /schedule.*\(1\)/i })).toBeInTheDocument();
  });

  test("clicking Violations tab shows Compliance Status section", async () => {
    const { user } = await renderLoaded({ violations: VIOLATIONS });
    await user.click(screen.getByRole("button", { name: /^violations/i }));
    expect(screen.getByRole("heading", { name: /compliance status/i })).toBeInTheDocument();
  });

  test("violations tab shows 'no violations' message when list is empty", async () => {
    const { user } = await renderLoaded({ violations: [] });
    await user.click(screen.getByRole("button", { name: /violations/i }));
    expect(screen.getByText(/no violations on record/i)).toBeInTheDocument();
  });

  test("clicking Schedule tab shows Sampling Schedule section and status chips", async () => {
    const { user } = await renderLoaded({ schedule: SCHEDULE });
    await user.click(screen.getByRole("button", { name: /^schedule/i }));
    expect(screen.getByRole("heading", { name: /sampling schedule/i })).toBeInTheDocument();
    expect(screen.getByText("1 Overdue")).toBeInTheDocument();
    expect(screen.getByText("1 Current")).toBeInTheDocument();
    expect(screen.getByText("Overdue 55 days")).toBeInTheDocument();
  });

  test("clicking Submit tab renders the SampleForm component", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: /^submit$/i }));
    expect(screen.getByText("SampleForm")).toBeInTheDocument();
  });

  test("clicking Samples tab shows the submissions table", async () => {
    const { user } = await renderLoaded();
    await user.click(screen.getByRole("button", { name: /^samples$/i }));
    expect(screen.getByRole("heading", { name: /my submissions/i })).toBeInTheDocument();
    expect(screen.getByText(`${THIS_YEAR}-04-15`)).toBeInTheDocument();
  });
});

// ── Sign out ───────────────────────────────────────────────────────────────────

describe("IUDashboard — sign out", () => {
  beforeEach(() => jest.clearAllMocks());

  test("Sign Out calls logout API then onLogout callback", async () => {
    const onLogout = jest.fn();
    const { user } = await renderLoaded({ onLogout });
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
