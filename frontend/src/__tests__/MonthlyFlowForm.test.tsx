import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import MonthlyFlowForm from "../components/Samples/MonthlyFlowForm";
import * as client from "../api/client";

jest.mock("../api/client");
const mocks = {
  getLastEndReading: client.getLastEndReading as jest.MockedFunction<typeof client.getLastEndReading>,
  createFlowReport:  client.createFlowReport  as jest.MockedFunction<typeof client.createFlowReport>,
};

// Pin clock to 2026-05-26 (May) so:
//   defaultMonth = 4 → "April" in the select (0-indexed getMonth() = 4)
//   defaultYear  = 2026
//   periodDays   = 30  (April has 30 days)
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-05-26"));
});
afterAll(() => jest.useRealTimers());

function renderForm(companyId = 7) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const onSubmitted = jest.fn();
  const view = render(<MonthlyFlowForm companyId={companyId} onSubmitted={onSubmitted} />);
  return { ...view, user, onSubmitted };
}

// ── Initial state ──────────────────────────────────────────────────────────────

describe("MonthlyFlowForm — initial state", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows heading and method tabs", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm();
    await act(async () => {});
    expect(screen.getByRole("heading", { name: /monthly flow report/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /meter totalizer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /time-volume/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /direct entry/i })).toBeInTheDocument();
  });

  test("meter tab is active by default — shows beginning/end reading inputs", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm();
    await waitFor(() => expect(mocks.getLastEndReading).toHaveBeenCalled());
    expect(screen.getByPlaceholderText(/totalizer at month start/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/totalizer at month end/i)).toBeInTheDocument();
  });

  test("submit button is disabled when no readings entered", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm();
    await act(async () => {});
    expect(screen.getByRole("button", { name: /submit flow report/i })).toBeDisabled();
  });

  test("calls getLastEndReading on mount with companyId", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm(42);
    await waitFor(() => expect(mocks.getLastEndReading).toHaveBeenCalledWith(42));
  });

  test("shows days in the default reporting period", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm();
    await act(async () => {});
    expect(screen.getByText("30 days")).toBeInTheDocument();
  });
});

// ── Meter prefill and status ───────────────────────────────────────────────────

describe("MonthlyFlowForm — meter prefill / status", () => {
  beforeEach(() => jest.clearAllMocks());

  test("pre-fills beginning read and label from monthly_report source", async () => {
    mocks.getLastEndReading.mockResolvedValue({
      data: {
        source: "monthly_report", end_read: 987654,
        from_month: 4, from_year: 2026,
        meter_id: 1, meter_label: "Main Meter", pulse_factor: 1000,
      },
    } as any);
    renderForm();
    await waitFor(() =>
      expect(screen.getByText(/pre-filled from april 2026 report end reading/i)).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue("987654")).toBeInTheDocument();
  });

  test("shows prefill label from meter_reading source", async () => {
    mocks.getLastEndReading.mockResolvedValue({
      data: {
        source: "meter_reading", end_read: 12345,
        meter_id: 1, meter_label: "West Meter", pulse_factor: 100,
      },
    } as any);
    renderForm();
    await waitFor(() =>
      expect(screen.getByText(/pre-filled from last meter reading end value/i)).toBeInTheDocument()
    );
  });

  test("shows meter label and pulse factor when meter is configured", async () => {
    mocks.getLastEndReading.mockResolvedValue({
      data: {
        source: "monthly_report", end_read: 0,
        from_month: 3, from_year: 2026,
        meter_id: 1, meter_label: "East Plant", pulse_factor: 500,
      },
    } as any);
    renderForm();
    await waitFor(() => expect(screen.getByText(/East Plant/)).toBeInTheDocument());
    expect(screen.getByText(/500/)).toBeInTheDocument();
  });

  test("shows no-meter warning when API returns null data", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    renderForm();
    await waitFor(() =>
      expect(screen.getByText(/no active flow meter configured/i)).toBeInTheDocument()
    );
  });

  test("shows no-meter warning when API call fails", async () => {
    mocks.getLastEndReading.mockRejectedValue(new Error("network error"));
    renderForm();
    await waitFor(() =>
      expect(screen.getByText(/no active flow meter configured/i)).toBeInTheDocument()
    );
  });
});

// ── Meter live calculation ─────────────────────────────────────────────────────

describe("MonthlyFlowForm — meter live calculation", () => {
  beforeEach(() => jest.clearAllMocks());

  async function setupMeter(beginVal: string, endVal: string) {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    const result = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: beginVal } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: endVal } });
    return result;
  }

  test("shows total flow when end > beginning (pulseFactor defaults to 1 gal/pulse)", async () => {
    await setupMeter("0", "1000000");
    // 1,000,000 pulses × 1 gal/pulse ÷ 1,000,000 = 1.0000 MG
    expect(screen.getByText(/1\.0000 MG/)).toBeInTheDocument();
  });

  test("shows monthly average in the calculation box", async () => {
    await setupMeter("0", "1000000");
    // 1.0 MG ÷ 30 days = 0.0333 MGD
    expect(screen.getByText(/0\.0333 MGD/)).toBeInTheDocument();
  });

  test("shows error when end reading is not greater than beginning reading", async () => {
    await setupMeter("2000", "1000");
    expect(
      screen.getByText(/end reading must be greater than beginning reading/i)
    ).toBeInTheDocument();
  });

  test("submit button is enabled when end > beginning", async () => {
    await setupMeter("0", "1000000");
    expect(screen.getByRole("button", { name: /submit flow report/i })).toBeEnabled();
  });

  test("submit button remains disabled when end <= beginning", async () => {
    await setupMeter("5000", "5000");
    expect(screen.getByRole("button", { name: /submit flow report/i })).toBeDisabled();
  });
});

// ── Time-volume method ─────────────────────────────────────────────────────────

describe("MonthlyFlowForm — time-volume method", () => {
  beforeEach(() => jest.clearAllMocks());

  async function switchToTV() {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    const result = renderForm();
    await result.user.click(screen.getByRole("button", { name: /time-volume/i }));
    return result;
  }

  test("switching to Time-Volume shows operating hours and first measurement row", async () => {
    await switchToTV();
    expect(screen.getByPlaceholderText("Hours/day")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Meas. 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Seconds")).toBeInTheDocument();
  });

  test("shows live GPM and total flow when measurement is valid", async () => {
    await switchToTV();
    // 10 gal / 60 sec = 10 GPM; 10 × 60min × 24hr × 30days ÷ 1,000,000 = 0.4320 MG
    fireEvent.change(screen.getByPlaceholderText("Meas. 1"), { target: { value: "10" } });
    fireEvent.change(screen.getByPlaceholderText("Seconds"),  { target: { value: "60" } });
    await waitFor(() => expect(screen.getByText(/10\.00 GPM/)).toBeInTheDocument());
    expect(screen.getByText(/0\.4320 MG/)).toBeInTheDocument();
  });

  test("Add measurement button appends a row", async () => {
    const { user } = await switchToTV();
    await user.click(screen.getByRole("button", { name: /add measurement/i }));
    expect(screen.getByPlaceholderText("Meas. 2")).toBeInTheDocument();
  });

  test("remove (✕) button not shown with only one row", async () => {
    await switchToTV();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  test("remove (✕) button appears with multiple rows and removes the row", async () => {
    const { user } = await switchToTV();
    await user.click(screen.getByRole("button", { name: /add measurement/i }));
    const removeBtns = screen.getAllByText("✕");
    expect(removeBtns).toHaveLength(2);
    await user.click(removeBtns[1]);
    expect(screen.queryByPlaceholderText("Meas. 2")).not.toBeInTheDocument();
  });

  test("submit enabled when time-volume calculation is valid", async () => {
    await switchToTV();
    fireEvent.change(screen.getByPlaceholderText("Meas. 1"), { target: { value: "10" } });
    fireEvent.change(screen.getByPlaceholderText("Seconds"),  { target: { value: "60" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /submit flow report/i })).toBeEnabled()
    );
  });
});

// ── Direct entry method ────────────────────────────────────────────────────────

describe("MonthlyFlowForm — direct entry method", () => {
  beforeEach(() => jest.clearAllMocks());

  async function switchToDirect() {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    const result = renderForm();
    await result.user.click(screen.getByRole("button", { name: /direct entry/i }));
    return result;
  }

  test("switching to Direct Entry shows total MG input by default", async () => {
    await switchToDirect();
    expect(screen.getByPlaceholderText(/e\.g\. 1\.2345/i)).toBeInTheDocument();
    expect(screen.getByText(/monthly average \(computed\)/i)).toBeInTheDocument();
  });

  test("entering total MG shows computed monthly average", async () => {
    await switchToDirect();
    // 1.5 MG ÷ 30 days = 0.0500 MGD
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 1\.2345/i), { target: { value: "1.5" } });
    expect(screen.getByText("0.0500 MGD")).toBeInTheDocument();
  });

  test("switching to Avg MGD mode shows avg input and computed total", async () => {
    const { user } = await switchToDirect();
    await user.click(screen.getByRole("button", { name: /enter avg mgd/i }));
    expect(screen.getByPlaceholderText(/e\.g\. 0\.0412/i)).toBeInTheDocument();
    expect(screen.getByText(/total monthly flow \(computed\)/i)).toBeInTheDocument();
  });

  test("entering avg MGD shows computed total MG", async () => {
    const { user } = await switchToDirect();
    await user.click(screen.getByRole("button", { name: /enter avg mgd/i }));
    // 0.05 MGD × 30 days = 1.5000 MG
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 0\.0412/i), { target: { value: "0.05" } });
    expect(screen.getByText("1.5000 MG")).toBeInTheDocument();
  });

  test("submit enabled when direct total value is positive", async () => {
    await switchToDirect();
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 1\.2345/i), { target: { value: "1.5" } });
    expect(screen.getByRole("button", { name: /submit flow report/i })).toBeEnabled();
  });
});

// ── Submission ─────────────────────────────────────────────────────────────────

describe("MonthlyFlowForm — submission", () => {
  beforeEach(() => jest.clearAllMocks());

  async function fillMeterAndSubmit(endRead = "1000000", violations: any[] = []) {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    mocks.createFlowReport.mockResolvedValue({ data: { violations } } as any);
    const { user, onSubmitted } = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: endRead } });
    await user.click(screen.getByRole("button", { name: /submit flow report/i }));
    // Wait for setSubmitting(false) in the finally block — button text returns from "Submitting…".
    await waitFor(() => screen.getByRole("button", { name: /submit flow report/i }));
    return { onSubmitted };
  }

  test("calls createFlowReport with correct meter payload", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    mocks.createFlowReport.mockResolvedValue({ data: { violations: [] } } as any);
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: "2000000" } });
    await user.click(screen.getByRole("button", { name: /submit flow report/i }));
    expect(mocks.createFlowReport).toHaveBeenCalledWith(expect.objectContaining({
      company_id:         7,
      measurement_method: "meter",
      beginning_read:     0,
      end_read:           2000000,
      period_days:        30,
    }));
  });

  test("shows success message and calls onSubmitted when no violations", async () => {
    const { onSubmitted } = await fillMeterAndSubmit("1000000", []);
    await waitFor(() =>
      expect(screen.getByText(/flow report submitted — no flow limit violations/i)).toBeInTheDocument()
    );
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });

  test("shows violation count and parameter name when violations are detected", async () => {
    await fillMeterAndSubmit("1000000", [{ parameter_name: "Plant Flow" }]);
    await waitFor(() =>
      expect(screen.getByText(/1 flow limit violation/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/Plant Flow/)).toBeInTheDocument();
  });

  test("shows API error message on submission failure", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    mocks.createFlowReport.mockRejectedValue({
      response: { data: { error: "Duplicate report for this period." } },
    });
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: "1000000" } });
    await user.click(screen.getByRole("button", { name: /submit flow report/i }));
    await waitFor(() =>
      expect(screen.getByText("Duplicate report for this period.")).toBeInTheDocument()
    );
  });

  test("falls back to generic error when API gives no message", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    mocks.createFlowReport.mockRejectedValue(new Error("network timeout"));
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: "1000000" } });
    await user.click(screen.getByRole("button", { name: /submit flow report/i }));
    await waitFor(() =>
      expect(screen.getByText("Submission failed.")).toBeInTheDocument()
    );
  });

  test("disables submit button while submitting", async () => {
    mocks.getLastEndReading.mockResolvedValue({ data: null } as any);
    let resolve: (v: any) => void;
    mocks.createFlowReport.mockReturnValue(new Promise(r => { resolve = r; }) as any);
    const { user } = renderForm();
    await waitFor(() => screen.getByPlaceholderText(/totalizer at month start/i));
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month start/i), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/totalizer at month end/i),   { target: { value: "1000000" } });
    await user.click(screen.getByRole("button", { name: /submit flow report/i }));
    expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();
    await act(async () => { resolve!({ data: { violations: [] } }); });
  });

  test("advances beginning read to end read value after meter submit", async () => {
    await fillMeterAndSubmit("1000000");
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/totalizer at month start/i)).toHaveValue(1000000)
    );
    expect(screen.getByPlaceholderText(/totalizer at month end/i)).toHaveValue(null);
  });

  test("shows prefill label referencing the submitted period after meter submit", async () => {
    await fillMeterAndSubmit("1000000");
    await waitFor(() =>
      expect(screen.getByText(/pre-filled from april 2026 report end reading/i)).toBeInTheDocument()
    );
  });
});
