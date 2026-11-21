import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { createRoot, render } = vi.hoisted(() => {
  const render = vi.fn();
  return { render, createRoot: vi.fn(() => ({ render })) };
});
vi.mock("react-dom/client", () => ({ createRoot }));
vi.mock("./App", () => ({ App: () => null }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });
function location(pathname: string, search = "") {
  const replace = vi.fn();
  vi.stubGlobal("window", { location: { pathname, search, replace } });
  vi.stubGlobal("document", { getElementById: () => ({ id: "root" }) });
  return replace;
}
describe("Standalone dashboard entry", () => {
  it("runs the dashboard at the root URL", async () => {
    location("/");
    await import("./main");
    expect(createRoot).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });
  it("runs the dashboard at the sign-in return URL", async () => {
    location("/dashboard");
    await import("./main");
    expect(render).toHaveBeenCalledOnce();
  });
  it("keeps the original Firebase sign-in destination and dashboard return", async () => {
    const replace = location("/auth");
    await import("./main");
    expect(replace).toHaveBeenCalledWith("/legacy/auth/auth.html?return=/dashboard");
    expect(createRoot).not.toHaveBeenCalled();
  });
  it("preserves sign-in query parameters", async () => {
    const replace = location("/auth/", "?mode=signin&return=%2Fdashboard");
    await import("./main");
    expect(replace).toHaveBeenCalledWith("/legacy/auth/auth.html?mode=signin&return=%2Fdashboard");
  });
});
