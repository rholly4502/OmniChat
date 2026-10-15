import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BotIcon, BoltIcon, LockIcon, UnlockIcon } from "../components/Icons";

describe("icons", () => {
  it("renders all icons as decorative SVGs hidden from assistive technology", () => {
    render(<><BotIcon /><BoltIcon /><LockIcon /><UnlockIcon /></>);

    const icons = document.querySelectorAll("svg");
    expect(icons).toHaveLength(4);
    for (const icon of icons) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
    }
  });

  it("preserves each existing default icon size", () => {
    render(<><BotIcon /><BoltIcon /><LockIcon /><UnlockIcon /></>);

    const icons = [...document.querySelectorAll("svg")];
    expect(icons.map((icon) => icon.getAttribute("width"))).toEqual(["16", "16", "14", "14"]);
    expect(icons.map((icon) => icon.getAttribute("height"))).toEqual(["16", "16", "14", "14"]);
  });

  it("allows callers to override icon dimensions", () => {
    render(<><BotIcon size={20} /><BoltIcon size={18} /></>);

    const [bot, bolt] = document.querySelectorAll("svg");
    expect(bot).toHaveAttribute("width", "20");
    expect(bot).toHaveAttribute("height", "20");
    expect(bolt).toHaveAttribute("width", "18");
    expect(bolt).toHaveAttribute("height", "18");
  });
});
