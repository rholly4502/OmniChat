import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CodeBlock } from "../components/CodeBlock";
// The App re-export is a compatibility contract: App.test.tsx imports CodeBlock
// from '../App'. A refactor that drops it breaks that import silently.
import { CodeBlock as CodeBlockFromApp } from "../App";

describe("CodeBlock (extracted module)", () => {
  beforeEach(() => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined);
  });

  it("is the same component as the one re-exported from App", () => {
    expect(CodeBlockFromApp).toBe(CodeBlock);
  });

  it("renders a copy button with an accessible label", () => {
    render(<CodeBlock>const x = 42;</CodeBlock>);

    expect(
      screen.getByRole("button", { name: "Copy code to clipboard" }),
    ).toBeInTheDocument();
  });

  it("renders the code inside a pre element", () => {
    const { container } = render(<CodeBlock>{"console.log('hi')"}</CodeBlock>);

    expect(container.querySelector("pre")).toHaveTextContent("console.log('hi')");
  });

  it("copies the pre textContent to the clipboard", async () => {
    render(<CodeBlock>{"const answer = 42;"}</CodeBlock>);

    screen.getByRole("button", { name: "Copy code to clipboard" }).click();

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const answer = 42;"),
    );
  });

  it("swaps the label to the copied state after a click", async () => {
    render(<CodeBlock>{"npm run build"}</CodeBlock>);

    screen.getByRole("button", { name: "Copy code to clipboard" }).click();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Code copied to clipboard" }),
      ).toBeInTheDocument(),
    );
  });

  it("keeps the keyboard focus ring and a 44px mobile touch target", () => {
    render(<CodeBlock>{"test"}</CodeBlock>);

    const btn = screen.getByRole("button", { name: "Copy code to clipboard" });
    expect(btn.className).toContain("focus-visible:ring-2");
    expect(btn.className).toContain("min-h-[44px]");
  });
});
