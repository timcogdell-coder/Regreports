import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "../App";
import * as client from "../api/client";

// Mock all dashboard components — they each fire dozens of API calls on mount
jest.mock("../components/Dashboard/IUDashboard",          () => () => <div>IU Dashboard</div>);
jest.mock("../components/Dashboard/CoordinatorDashboard", () => () => <div>Coordinator Dashboard</div>);
jest.mock("../components/Dashboard/AdminDashboard",       () => () => <div>Admin Dashboard</div>);
jest.mock("../components/Dashboard/FinanceDashboard",     () => () => <div>Finance Dashboard</div>);
jest.mock("../api/client");

const mockGetCurrentUser = client.getCurrentUser as jest.MockedFunction<typeof client.getCurrentUser>;

function userFor(role: string) {
  return { id: 1, username: "test", email: "test@example.com", role, company_id: null };
}

describe("App routing", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows loading state initially", () => {
    // Never resolves — keeps app in loading state
    mockGetCurrentUser.mockReturnValue(new Promise(() => {}) as any);
    render(<App />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  test("shows login form when not authenticated", async () => {
    mockGetCurrentUser.mockRejectedValue(new Error("401"));
    render(<App />);
    await waitFor(() => expect(screen.getByText("Regreports PIMS")).toBeInTheDocument());
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  test("renders IUDashboard for iu role", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: userFor("iu") } as any);
    render(<App />);
    await waitFor(() => expect(screen.getByText("IU Dashboard")).toBeInTheDocument());
  });

  test("renders CoordinatorDashboard for coordinator role", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: userFor("coordinator") } as any);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Coordinator Dashboard")).toBeInTheDocument());
  });

  test("renders AdminDashboard for admin role", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: userFor("admin") } as any);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
  });

  test("renders FinanceDashboard for finance role", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: userFor("finance") } as any);
    render(<App />);
    await waitFor(() => expect(screen.getByText("Finance Dashboard")).toBeInTheDocument());
  });

  test("authenticated user at /login is redirected to dashboard", async () => {
    mockGetCurrentUser.mockResolvedValue({ data: userFor("admin") } as any);
    window.history.pushState({}, "", "/login");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Admin Dashboard")).toBeInTheDocument());
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
    // Reset URL for subsequent tests
    window.history.pushState({}, "", "/");
  });
});
