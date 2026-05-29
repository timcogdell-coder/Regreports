import React from "react";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import SampleForm from "../components/Samples/SampleForm";
import * as client from "../api/client";

jest.mock("../api/client");
const mocks = {
  getPermits:          client.getPermits          as jest.MockedFunction<typeof client.getPermits>,
  getParameters:       client.getParameters       as jest.MockedFunction<typeof client.getParameters>,
  getSamples:          client.getSamples          as jest.MockedFunction<typeof client.getSamples>,
  getFlowReports:      client.getFlowReports      as jest.MockedFunction<typeof client.getFlowReports>,
  getSamplingSchedule: client.getSamplingSchedule as jest.MockedFunction<typeof client.getSamplingSchedule>,
  getPermit:           client.getPermit           as jest.MockedFunction<typeof client.getPermit>,
  submitSample:        client.submitSample        as jest.MockedFunction<typeof client.submitSample>,
};

const PERMIT = { id: 5, company_id: 7, permit_number: "004", is_active: true, limits: [] };

const LIMITS = [
  {
    id: 10, parameter_name: "BOD", is_flow_limit: false, is_monitor_report: false,
    is_range_limit: false, daily_max_concentration: 300, daily_min_concentration: null,
    weekly_max_concentration: null, monthly_avg_concentration: null, daily_max_loading: null,
    weekly_max_concentration_is_mr: false, monthly_avg_concentration_is_mr: false,
  },
  {
    id: 11, parameter_name: "pH", is_flow_limit: false, is_monitor_report: false,
    is_range_limit: true, min_value: 6, max_value: 10, range_unit: "s.u.",
    daily_max_concentration: null, daily_min_concentration: null, daily_max_loading: null,
    weekly_max_concentration: null, monthly_avg_concentration: null,
    weekly_max_concentration_is_mr: false, monthly_avg_concentration_is_mr: false,
  },
  {
    id: 12, parameter_name: "Temperature", is_flow_limit: false, is_monitor_report: true,
    is_range_limit: false, daily_max_concentration: null, daily_min_concentration: null,
    daily_max_loading: null, weekly_max_concentration: null, monthly_avg_concentration: null,
    weekly_max_concentration_is_mr: false, monthly_avg_concentration_is_mr: false,
  },
  {
    id: 20, parameter_name: "Plant Flow", is_flow_limit: true,
    is_monitor_report: false, is_range_limit: false,
    daily_max_concentration: null, daily_min_concentration: null, daily_max_loading: null,
    weekly_max_concentration: null, monthly_avg_concentration: null,
    weekly_max_concentration_is_mr: false, monthly_avg_concentration_is_mr: false,
  },
];

function setupDefaultMocks() {
  mocks.getPermits.mockResolvedValue({ data: [PERMIT] } as any);
  mocks.getParameters.mockResolvedValue({ data: [] } as any);
  mocks.getSamples.mockResolvedValue({ data: [{ sampler_name: "Alice" }, { sampler_name: "Bob" }] } as any);
  mocks.getFlowReports.mockResolvedValue({ data: [] } as any);
  mocks.getSamplingSchedule.mockResolvedValue({ data: [] } as any);
  mocks.getPermit.mockResolvedValue({ data: { ...PERMIT, limits: LIMITS } } as any);
}

function renderForm(onSubmitted = jest.fn()) {
  return {
    ...render(<SampleForm companyId={7} companyName="Kraft-Henize" onSubmitted={onSubmitted} />),
    onSubmitted,
    user: userEvent.setup(),
  };
}

// Helper: select the permit and wait for limits to load
async function selectPermit(u: ReturnType<typeof userEvent.setup>) {
  const select = screen.getByRole("combobox");
  await u.selectOptions(select, "5");
  await waitFor(() => screen.getByText("BOD"));
}

// ── Rendering ────────────────────────────────────────────────────────────────

describe("SampleForm — rendering", () => {
  beforeEach(() => { jest.clearAllMocks(); setupDefaultMocks(); });

  test("renders form title and main fields", async () => {
    renderForm();
    await waitFor(() => screen.getByRole("heading", { name: /submit sample data/i }));
    expect(screen.getByText("Permit")).toBeInTheDocument();
    expect(screen.getByText("Sample Date")).toBeInTheDocument();
    expect(screen.getByText("Sampler Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit sample data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
  });

  test("shows 'Import from COA PDF' button", async () => {
    renderForm();
    await waitFor(() => screen.getByText(/Import from COA PDF/i));
    expect(screen.getByRole("button", { name: /import from coa pdf/i })).toBeInTheDocument();
  });

  test("clicking 'Import from COA PDF' shows the COAImport panel", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByRole("button", { name: /import from coa pdf/i }));
    await user.click(screen.getByRole("button", { name: /import from coa pdf/i }));
    expect(screen.getByText("Import from COA PDF")).toBeInTheDocument();
    expect(screen.getByText(/Click or drag a COA PDF here/i)).toBeInTheDocument();
  });

  test("flow limit parameter is not shown in lab results", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await selectPermit(user);
    expect(screen.queryByText("Plant Flow")).not.toBeInTheDocument();
  });
});

// ── Reporting period ─────────────────────────────────────────────────────────

describe("SampleForm — reporting period", () => {
  beforeEach(() => { jest.clearAllMocks(); setupDefaultMocks(); });

  test("shows 'Enter sample date' placeholder before date is set", async () => {
    renderForm();
    await waitFor(() => screen.getByText("Reporting Period"));
    expect(screen.getByText("Enter sample date")).toBeInTheDocument();
  });

  test("computes period label and day count from sample date", async () => {
    const { user, container } = renderForm();
    await waitFor(() => screen.getByText("Sample Date"));
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, "2026-05-15");
    await waitFor(() => screen.getByText(/May.*2026/));
    expect(screen.getByText(/31 days/)).toBeInTheDocument();
  });
});

// ── Overdue alerts ───────────────────────────────────────────────────────────

describe("SampleForm — overdue alerts", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows overdue warning banner when schedule has overdue items", async () => {
    setupDefaultMocks();
    mocks.getSamplingSchedule.mockResolvedValue({
      data: [
        { status: "overdue", parameter_name: "BOD", days_overdue: 12, next_due_date: "2026-05-01" },
        { status: "never",   parameter_name: "TSS" },
      ],
    } as any);
    renderForm();
    await waitFor(() => screen.getByText(/overdue sampling requirements/i));
    expect(screen.getAllByText(/BOD/).length).toBeGreaterThan(0);
    expect(screen.getByText(/12d overdue/)).toBeInTheDocument();
    expect(screen.getByText(/TSS/)).toBeInTheDocument();
    expect(screen.getByText(/never sampled/)).toBeInTheDocument();
  });

  test("no overdue banner when all parameters are on schedule", async () => {
    setupDefaultMocks();
    mocks.getSamplingSchedule.mockResolvedValue({ data: [{ status: "ok", parameter_name: "BOD" }] } as any);
    renderForm();
    await waitFor(() => screen.getByRole("heading", { name: /submit sample data/i }));
    expect(screen.queryByText(/overdue sampling requirements/i)).not.toBeInTheDocument();
  });
});

// ── Draft persistence ────────────────────────────────────────────────────────

describe("SampleForm — draft persistence", () => {
  const DRAFT_KEY = "draft_sample_7";

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    localStorage.clear();
  });

  test("restores saved draft from localStorage on mount", async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      permitId: 5, sampleDate: "2026-05-10", samplerName: "Alice", temperature: "22", results: {},
    }));
    renderForm();
    await waitFor(() => screen.getByText(/draft restored/i));
    expect(screen.getByDisplayValue("2026-05-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
  });

  test("discard draft button clears fields and hides the restored banner", async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      permitId: 5, sampleDate: "2026-05-10", samplerName: "Alice", temperature: "", results: {},
    }));
    const { user, container } = renderForm();
    await waitFor(() => screen.getByText(/draft restored/i));
    await user.click(screen.getByRole("button", { name: /discard draft/i }));
    // Banner disappears
    expect(screen.queryByText(/draft restored/i)).not.toBeInTheDocument();
    // Date and sampler fields are cleared
    expect(container.querySelector('input[type="date"]')).toHaveValue("");
    expect(screen.getByPlaceholderText("Type or select…")).toHaveValue("");
  });

  test("Save Draft button writes to localStorage and shows confirmation", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByRole("button", { name: /save draft/i }));
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() =>
      screen.getByText(/draft saved.*you can return/i)
    );
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
  });
});

// ── Real-time pass/fail badges ───────────────────────────────────────────────

describe("SampleForm — pass/fail badges", () => {
  beforeEach(() => { jest.clearAllMocks(); setupDefaultMocks(); });

  async function loadLimits() {
    const { user } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await selectPermit(user);
    return user;
  }

  test("no pass/fail badge shown before a value is entered", async () => {
    await loadLimits();
    // MR badge always shows for monitor-report limits; pass/fail badges require input
    expect(screen.queryByText(/pass|exceeds|in range|out of range/i)).not.toBeInTheDocument();
  });

  test("shows '✓ Pass' when value is below daily max", async () => {
    const user = await loadLimits();
    // BOD daily_max_concentration = 300
    const bodInput = screen.getAllByPlaceholderText("mg/L")[0];
    await user.type(bodInput, "250");
    await waitFor(() => expect(screen.getByText("✓ Pass")).toBeInTheDocument());
  });

  test("shows '✗ Exceeds' when value exceeds daily max", async () => {
    const user = await loadLimits();
    const bodInput = screen.getAllByPlaceholderText("mg/L")[0];
    await user.type(bodInput, "350");
    await waitFor(() => expect(screen.getByText("✗ Exceeds")).toBeInTheDocument());
  });

  test("shows '✓ In Range' when range-limit value is within bounds", async () => {
    const user = await loadLimits();
    // pH: min=6, max=10
    const phInput = screen.getAllByPlaceholderText("mg/L")[1];
    await user.type(phInput, "7.5");
    await waitFor(() => expect(screen.getByText("✓ In Range")).toBeInTheDocument());
  });

  test("shows '✗ Out of Range' when range-limit value is outside bounds", async () => {
    await loadLimits();
    // pH is the second non-flow limit (index 1); use fireEvent to set the full value atomically
    fireEvent.change(screen.getAllByPlaceholderText("mg/L")[1], { target: { value: "11" } });
    await waitFor(() => expect(screen.getByText("✗ Out of Range")).toBeInTheDocument());
  });

  test("shows 'MR' badge for monitor-report parameters", async () => {
    await loadLimits();
    // Temperature is is_monitor_report=true; badge shows even with no value
    expect(screen.getByText("MR")).toBeInTheDocument();
  });
});

// ── Sampler autocomplete ─────────────────────────────────────────────────────

describe("SampleForm — sampler autocomplete", () => {
  beforeEach(() => { jest.clearAllMocks(); setupDefaultMocks(); });

  test("shows suggestions matching typed text", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText("Type or select…"));
    const samplerInput = screen.getByPlaceholderText("Type or select…");
    await user.type(samplerInput, "al");
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  test("clicking a suggestion fills the input", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText("Type or select…"));
    const samplerInput = screen.getByPlaceholderText("Type or select…");
    await user.click(samplerInput);
    await waitFor(() => screen.getByText("Alice"));
    await user.click(screen.getByText("Alice"));
    expect(samplerInput).toHaveValue("Alice");
  });
});

// ── Submission ───────────────────────────────────────────────────────────────

describe("SampleForm — submission", () => {
  beforeEach(() => { jest.clearAllMocks(); setupDefaultMocks(); localStorage.clear(); });

  test("shows validation error when sample date is missing", async () => {
    const { user } = renderForm();
    await waitFor(() => screen.getByRole("button", { name: /submit sample data/i }));
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => screen.getByText("Please enter a sample date."));
  });

  test("calls submitSample with correct payload", async () => {
    mocks.submitSample.mockResolvedValue({ data: { violations: [] } } as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await selectPermit(user);

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    await user.type(dateInput, "2026-05-15");

    await user.type(screen.getAllByPlaceholderText("mg/L")[0], "250");

    await user.click(screen.getByRole("button", { name: /submit sample data/i }));

    await waitFor(() => expect(mocks.submitSample).toHaveBeenCalled());
    const payload = mocks.submitSample.mock.calls[0][0] as any;
    expect(payload.company_id).toBe(7);
    expect(payload.permit_id).toBe(5);
    expect(payload.sample_date).toBe("2026-05-15");
    expect(payload.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ permit_limit_id: 10, concentration: 250 }),
      ])
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
  });

  test("shows success message when no violations detected", async () => {
    mocks.submitSample.mockResolvedValue({ data: { violations: [] } } as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => screen.getByText(/no violations detected/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
  });

  test("shows violation count message when violations are detected", async () => {
    mocks.submitSample.mockResolvedValue({
      data: { violations: [{ id: 1 }, { id: 2 }] },
    } as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => screen.getByText(/2 violation\(s\) detected/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
  });

  test("shows error message on submission failure", async () => {
    mocks.submitSample.mockRejectedValue(new Error("500"));
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => screen.getByText(/submission failed/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
  });

  test("resets results in localStorage after successful submission", async () => {
    const DRAFT_KEY = "draft_sample_7";
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ permitId: 5, results: { 10: "250" } }));
    mocks.submitSample.mockResolvedValue({ data: { violations: [] } } as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => screen.getByText(/no violations detected/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
    // Auto-save fires after setResults({}), so results should be empty in the saved draft
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    expect(saved.results).toEqual({});
  });

  test("disables submit button while submitting", async () => {
    let resolve: (v: any) => void;
    mocks.submitSample.mockReturnValue(new Promise(r => { resolve = r; }) as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await user.selectOptions(screen.getByRole("combobox"), "5");
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled()
    );
    await act(async () => { resolve!({ data: { violations: [] } }); });
  });

  test("empty result inputs are excluded from payload", async () => {
    mocks.submitSample.mockResolvedValue({ data: { violations: [] } } as any);
    const { user, container } = renderForm();
    await waitFor(() => screen.getByRole("combobox"));
    await selectPermit(user);
    await user.type(container.querySelector('input[type="date"]') as HTMLInputElement, "2026-05-15");
    // Leave all result inputs blank
    await user.click(screen.getByRole("button", { name: /submit sample data/i }));
    await waitFor(() => expect(mocks.submitSample).toHaveBeenCalled());
    const payload = mocks.submitSample.mock.calls[0][0] as any;
    expect(payload.results).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole("button", { name: /submit sample data/i })).toBeEnabled());
  });
});
