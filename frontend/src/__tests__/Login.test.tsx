import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import Login from "../components/Login";
import * as client from "../api/client";

jest.mock("../api/client");
const mockLogin = client.login as jest.MockedFunction<typeof client.login>;

const user = userEvent.setup();

function renderLogin(onLogin = jest.fn()) {
  render(<Login onLogin={onLogin} />);
  return {
    username: screen.getByLabelText("Username"),
    password: screen.getByLabelText("Password"),
    submit:   screen.getByRole("button", { name: /sign in/i }),
    onLogin,
  };
}

describe("Login", () => {
  beforeEach(() => jest.clearAllMocks());

  test("renders title, subtitle, and form fields", () => {
    renderLogin();
    expect(screen.getByText("Regreports PIMS")).toBeInTheDocument();
    expect(screen.getByText("Pretreatment Information Management System")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  test("password field is type=password", () => {
    renderLogin();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  test("calls login() with entered credentials on submit", async () => {
    mockLogin.mockResolvedValue({ data: { user: { id: 1, username: "Tim", role: "admin" } } } as any);
    const { username, password, submit } = renderLogin();

    await user.type(username, "Tim");
    await user.type(password, "secret");
    await user.click(submit);

    expect(mockLogin).toHaveBeenCalledWith("Tim", "secret");
  });

  test("calls onLogin with user data on success", async () => {
    const fakeUser = { id: 1, username: "Tim", role: "admin" };
    mockLogin.mockResolvedValue({ data: { user: fakeUser } } as any);
    const { username, password, submit, onLogin } = renderLogin();

    await user.type(username, "Tim");
    await user.type(password, "secret");
    await user.click(submit);

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(fakeUser));
  });

  test("shows error message on failed login", async () => {
    mockLogin.mockRejectedValue(new Error("401"));
    const { username, password, submit } = renderLogin();

    await user.type(username, "Tim");
    await user.type(password, "wrong");
    await user.click(submit);

    await waitFor(() =>
      expect(screen.getByText("Invalid username or password.")).toBeInTheDocument()
    );
  });

  test("disables button and shows Signing in… while loading", async () => {
    let resolve: (v: any) => void;
    mockLogin.mockReturnValue(new Promise(r => { resolve = r; }) as any);
    const { username, password, submit } = renderLogin();

    await user.type(username, "Tim");
    await user.type(password, "secret");
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Signing in…");

    await act(async () => { resolve!({ data: { user: { id: 1, username: "Tim", role: "admin" } } }); });
  });

  test("clears error on a new submit attempt", async () => {
    mockLogin
      .mockRejectedValueOnce(new Error("401"))
      .mockResolvedValue({ data: { user: { id: 1, username: "Tim", role: "admin" } } } as any);

    const { username, password, submit } = renderLogin();
    await user.type(username, "Tim");
    await user.type(password, "wrong");
    await user.click(submit);
    await waitFor(() => screen.getByText("Invalid username or password."));

    // Second attempt clears the error before the response arrives
    await user.click(submit);
    await waitFor(() =>
      expect(screen.queryByText("Invalid username or password.")).not.toBeInTheDocument()
    );
  });
});
