import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { Cat, CatScene } from "../Cat";
import { KittyRoom } from "../KittyRoom";

const owner = "0x1111111111111111111111111111111111111111" as const;

describe("living cats mount where the app puts them", () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  });
  afterEach(() => jest.restoreAllMocks());

  // App.tsx renders WelcomeScreen outside the NavigationContainer: no navigation object there.
  it("the welcome cat runs without a navigator", async () => {
    await render(<KittyRoom />);
    await act(async () => {});
    expect(screen.getByLabelText("Kitty, a pink cat, sitting on a cushion in a sunny room")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Say hello to Kitty" })).toBeTruthy();
  });

  it("the portrait and the Home cat run without a navigator, and with Reduce Motion", async () => {
    await render(<><CatScene owner={owner} stage="Friendly" name="Mimi" /><Cat owner={owner} stage="Friendly" size={124} bowl="full" react /></>);
    await act(async () => {});
    expect(screen.getByLabelText(/Mimi/)).toBeTruthy();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<CatScene owner={owner} stage="Away" name="Mimi" />);
    await act(async () => {});
  });
});
