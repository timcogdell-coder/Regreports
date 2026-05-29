import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import COAImport from "../components/COAImport";
import * as client from "../api/client";

jest.mock("../api/client");
const mockParseCOA = client.parseCOA as jest.MockedFunction<typeof client.parseCOA>;

const PARAMETERS = [
  { id: 10, name: "Biochemical Oxygen Demand" },
  { id: 11, name: "Total Suspended Solids" },
  { id: 12, name: "pH" },
];

// A realistic parse-coa API response
const PREVIEW = {
  source_file: "report.pdf",
  client: "Kraft Heinz",
  job_id: "785-7807-1",
  permit_number: "004",
  permit_id: 3,
  in_permit: 2,
  matched: 3,
  unmatched: 1,
  samples: [{
    client_sample_id: "Process Flume",
    date_collected: "2026-05-01",
    matrix: "Wastewater",
    results: [
      { analyte: "BOD",  result: 450, unit: "mg/L", non_detect: false, matched: true,  in_permit: true,  permit_limit_id: 10, parameter_name: "Biochemical Oxygen Demand" },
      { analyte: "TSS",  result: 320, unit: "mg/L", non_detect: false, matched: true,  in_permit: true,  permit_limit_id: 11, parameter_name: "Total Suspended Solids" },
      { analyte: "COD",  result: 5,   unit: "mg/L", non_detect: true,  matched: true,  in_permit: false, permit_limit_id: null, parameter_name: "COD" },
      { analyte: "Zinc", result: 10,  unit: "ug/L", non_detect: false, matched: false, in_permit: false, permit_limit_id: null, parameter_name: null },
    ],
  }],
};

const PDF_FILE = new File(["dummy"], "report.pdf", { type: "application/pdf" });

function renderCOA({
  onConfirm = jest.fn(),
  onCancel  = jest.fn(),
  params    = PARAMETERS,
} = {}) {
  return {
    ...render(
      <COAImport
        companyId={7}
        companyName="Kraft-Henize"
        parameters={params}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ),
    onConfirm,
    onCancel,
  };
}

// ── Initial state ────────────────────────────────────────────────────────────

describe("COAImport — initial state", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows dropzone with company name and cancel button", () => {
    renderCOA();
    expect(screen.getByText(/Click or drag a COA PDF here/i)).toBeInTheDocument();
    expect(screen.getByText(/Kraft-Henize/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  test("cancel button calls onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderCOA();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("hidden file input accepts only PDFs", () => {
    const { container } = renderCOA();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute("accept", ".pdf");
  });
});

// ── File selection ───────────────────────────────────────────────────────────

describe("COAImport — file selection", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows 'Parsing PDF…' while the API call is in flight", async () => {
    let resolve: (v: any) => void;
    mockParseCOA.mockReturnValue(new Promise(r => { resolve = r; }) as any);
    const { container } = renderCOA();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });

    await waitFor(() =>
      expect(screen.getByText("Parsing PDF…")).toBeInTheDocument()
    );

    await act(async () => { resolve!({ data: PREVIEW }); });
  });

  test("calls parseCOA with companyId and selected file", async () => {
    mockParseCOA.mockResolvedValue({ data: PREVIEW } as any);
    const { container } = renderCOA();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });

    await waitFor(() => expect(mockParseCOA).toHaveBeenCalledWith(7, PDF_FILE));
  });

  test("shows error message when parse fails", async () => {
    mockParseCOA.mockRejectedValue({
      response: { data: { error: "Unsupported PDF format" } },
    });
    const { container } = renderCOA();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });

    await waitFor(() =>
      expect(screen.getByText("Unsupported PDF format")).toBeInTheDocument()
    );
  });

  test("falls back to generic error when API gives no message", async () => {
    mockParseCOA.mockRejectedValue(new Error("network error"));
    const { container } = renderCOA();

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });

    await waitFor(() =>
      expect(screen.getByText("Failed to parse PDF")).toBeInTheDocument()
    );
  });

  test("parses file dropped onto the dropzone", async () => {
    mockParseCOA.mockResolvedValue({ data: PREVIEW } as any);
    renderCOA();

    const dropzone = screen.getByText(/Click or drag a COA PDF here/i).closest("div")!;
    fireEvent.drop(dropzone, { dataTransfer: { files: [PDF_FILE] } });

    await waitFor(() => expect(mockParseCOA).toHaveBeenCalledWith(7, PDF_FILE));
  });
});

// ── Preview state ────────────────────────────────────────────────────────────

describe("COAImport — preview", () => {
  beforeEach(() => jest.clearAllMocks());

  async function renderWithPreview(overrides?: Partial<typeof PARAMETERS[0]>[]) {
    mockParseCOA.mockResolvedValue({ data: PREVIEW } as any);
    const result = renderCOA();
    fireEvent.change(result.container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });
    await waitFor(() => screen.getByText("report.pdf"));
    return result;
  }

  test("shows source file, client, job ID and permit number", async () => {
    await renderWithPreview();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Kraft Heinz/)).toBeInTheDocument();
    expect(screen.getByText(/785-7807-1/)).toBeInTheDocument();
    expect(screen.getByText(/004/)).toBeInTheDocument();
  });

  test("shows summary chips with correct counts", async () => {
    await renderWithPreview();
    expect(screen.getByText("2 in permit")).toBeInTheDocument();
    // matched - in_permit = 3 - 2 = 1
    expect(screen.getByText("1 matched, not in permit")).toBeInTheDocument();
    expect(screen.getByText("1 unmatched")).toBeInTheDocument();
  });

  test("shows result rows with analyte, result, and unit", async () => {
    await renderWithPreview();
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.getByText("450")).toBeInTheDocument();
    expect(screen.getAllByText("mg/L").length).toBeGreaterThan(0);
  });

  test("in-permit numeric row shows 'In permit' badge", async () => {
    await renderWithPreview();
    // BOD and TSS are both in-permit (two badge spans + one in the footer note)
    expect(screen.getAllByText("In permit").length).toBeGreaterThanOrEqual(2);
  });

  test("non-detect row shows 'Non-detect' badge and ND value", async () => {
    await renderWithPreview();
    expect(screen.getByText("Non-detect")).toBeInTheDocument();
    expect(screen.getByText(/ND \(<5\)/i)).toBeInTheDocument();
  });

  test("unmatched row shows a parameter select dropdown", async () => {
    await renderWithPreview();
    // Zinc is unmatched → select rendered; COD is matched but not in permit → also a select
    const selects = screen.getAllByRole("combobox");
    expect(selects.length).toBeGreaterThan(0);
    // Each select contains the full parameter list as options
    expect(selects[0]).toBeInTheDocument();
    expect(screen.getAllByText("Biochemical Oxygen Demand").length).toBeGreaterThan(0);
  });

  test("'Try another file' resets to dropzone", async () => {
    const user = userEvent.setup();
    await renderWithPreview();

    await user.click(screen.getByRole("button", { name: /try another file/i }));
    expect(screen.getByText(/Click or drag a COA PDF here/i)).toBeInTheDocument();
  });

  test("cancel in preview calls onCancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = await renderWithPreview();

    // There are multiple cancel buttons after preview; click the last one
    const cancelBtns = screen.getAllByRole("button", { name: /cancel/i });
    await user.click(cancelBtns[cancelBtns.length - 1]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ── Confirm payload ──────────────────────────────────────────────────────────

describe("COAImport — confirm payload", () => {
  beforeEach(() => jest.clearAllMocks());

  async function getConfirmPayload(onConfirm = jest.fn()) {
    mockParseCOA.mockResolvedValue({ data: PREVIEW } as any);
    const user = userEvent.setup();
    const { container } = render(
      <COAImport companyId={7} companyName="Kraft-Henize"
        parameters={PARAMETERS} onConfirm={onConfirm} onCancel={jest.fn()} />
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });
    await waitFor(() => screen.getByText("report.pdf"));
    await user.click(screen.getByRole("button", { name: /import.*results/i }));
    return onConfirm.mock.calls[0][0];
  }

  test("includes only in-permit, non-ND rows", async () => {
    const payload = await getConfirmPayload();
    // BOD and TSS are in-permit + non-ND; COD is ND; Zinc is unmatched
    expect(payload.results).toHaveLength(2);
    expect(payload.results.map((r: any) => r.permit_limit_id)).toEqual(
      expect.arrayContaining([10, 11])
    );
  });

  test("payload has correct top-level fields", async () => {
    const payload = await getConfirmPayload();
    expect(payload.permit_id).toBe(3);
    expect(payload.sample_date).toBe("2026-05-01");
    expect(payload.coa_job_id).toBe("785-7807-1");
    expect(payload._preview).toEqual(PREVIEW);
  });

  test("result entries include permit_limit_id and concentration", async () => {
    const payload = await getConfirmPayload();
    expect(payload.results[0]).toMatchObject({
      permit_limit_id: expect.any(Number),
      concentration:   expect.any(Number),
    });
  });

  test("override changes the permit_limit_id used in payload", async () => {
    mockParseCOA.mockResolvedValue({ data: PREVIEW } as any);
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    const { container } = render(
      <COAImport companyId={7} companyName="Kraft-Henize"
        parameters={PARAMETERS} onConfirm={onConfirm} onCancel={jest.fn()} />
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [PDF_FILE] },
    });
    await waitFor(() => screen.getByText("report.pdf"));

    // The Zinc row (unmatched) has a select — assign it to pH (id=12)
    const select = screen.getAllByRole("combobox")[0];
    await user.selectOptions(select, "12");
    await user.click(screen.getByRole("button", { name: /import.*results/i }));

    const payload = onConfirm.mock.calls[0][0];
    // Now 3 results: BOD, TSS, and the overridden Zinc→pH
    expect(payload.results).toHaveLength(3);
    expect(payload.results.find((r: any) => r.permit_limit_id === 12)).toBeDefined();
  });
});
