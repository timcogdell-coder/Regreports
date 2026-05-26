import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import NotificationBell from "../components/NotificationBell";
import * as client from "../api/client";

jest.mock("../api/client");
const mockGetSchedule = client.getSamplingSchedule as jest.MockedFunction<typeof client.getSamplingSchedule>;

jest.useFakeTimers();

const overdueItem  = { status: "overdue",  parameter_name: "BOD",  company_name: "Cal-Maine", days_overdue: 5,  next_due_date: "2026-05-01" };
const dueSoonItem  = { status: "due_soon", parameter_name: "TSS",  company_name: "Kraft",     next_due_date: "2026-05-28" };
const onTrackItem  = { status: "ok",       parameter_name: "pH",   company_name: "Cal-Maine" };

function renderBell(onGoToSchedule = jest.fn(), companyId?: number) {
  return { ...render(<NotificationBell onGoToSchedule={onGoToSchedule} companyId={companyId} />), onGoToSchedule };
}

describe("NotificationBell", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders bell button", async () => {
    mockGetSchedule.mockResolvedValue({ data: [] } as any);
    renderBell();
    await act(async () => {});
    expect(screen.getByTitle("Sample schedule alerts")).toBeInTheDocument();
  });

  test("shows no badge when there are no alerts", async () => {
    mockGetSchedule.mockResolvedValue({ data: [onTrackItem] } as any);
    renderBell();
    await act(async () => {});
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  test("shows badge count for overdue and due_soon items", async () => {
    mockGetSchedule.mockResolvedValue({ data: [overdueItem, dueSoonItem, onTrackItem] } as any);
    renderBell();
    await act(async () => {});
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("caps badge at 99+", async () => {
    const manyItems = Array.from({ length: 100 }, () => ({ ...overdueItem }));
    mockGetSchedule.mockResolvedValue({ data: manyItems } as any);
    renderBell();
    await act(async () => {});
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  test("opens dropdown on bell click and shows overdue items", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetSchedule.mockResolvedValue({ data: [overdueItem] } as any);
    renderBell();
    await act(async () => {});

    await user.click(screen.getByTitle("Sample schedule alerts"));

    expect(screen.getByText("Schedule Alerts")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("BOD")).toBeInTheDocument();
    expect(screen.getByText("Cal-Maine")).toBeInTheDocument();
    expect(screen.getByText("5d overdue · due 2026-05-01")).toBeInTheDocument();
  });

  test("shows due soon items separately from overdue", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetSchedule.mockResolvedValue({ data: [overdueItem, dueSoonItem] } as any);
    renderBell();
    await act(async () => {});

    await user.click(screen.getByTitle("Sample schedule alerts"));

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Due Soon")).toBeInTheDocument();
    expect(screen.getByText("TSS")).toBeInTheDocument();
    expect(screen.getByText("Due 2026-05-28")).toBeInTheDocument();
  });

  test("shows empty state message when no alerts", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetSchedule.mockResolvedValue({ data: [] } as any);
    renderBell();
    await act(async () => {});

    await user.click(screen.getByTitle("Sample schedule alerts"));

    expect(screen.getByText("All parameters are on schedule.")).toBeInTheDocument();
  });

  test("View full schedule button calls onGoToSchedule and closes dropdown", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetSchedule.mockResolvedValue({ data: [overdueItem] } as any);
    const { onGoToSchedule } = renderBell();
    await act(async () => {});

    await user.click(screen.getByTitle("Sample schedule alerts"));
    await user.click(screen.getByText("View full schedule"));

    expect(onGoToSchedule).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Schedule Alerts")).not.toBeInTheDocument();
  });

  test("closes dropdown when clicking outside", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockGetSchedule.mockResolvedValue({ data: [overdueItem] } as any);
    renderBell();
    await act(async () => {});

    await user.click(screen.getByTitle("Sample schedule alerts"));
    expect(screen.getByText("Schedule Alerts")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByText("Schedule Alerts")).not.toBeInTheDocument();
  });

  test("polls every 5 minutes", async () => {
    mockGetSchedule.mockResolvedValue({ data: [] } as any);
    renderBell();
    await act(async () => {});

    expect(mockGetSchedule).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); });
    expect(mockGetSchedule).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); });
    expect(mockGetSchedule).toHaveBeenCalledTimes(3);
  });

  test("passes companyId to getSamplingSchedule", async () => {
    mockGetSchedule.mockResolvedValue({ data: [] } as any);
    renderBell(jest.fn(), 42);
    await act(async () => {});
    expect(mockGetSchedule).toHaveBeenCalledWith(42);
  });
});
