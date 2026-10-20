import {
  Button as BasaltButton,
  buttonVariants as basaltButtonVariants,
} from "@nocoo/basalt/components/button";
import { expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";

it("uses Basalt buttons without application style or size adapters", () => {
  expect(Button).toBe(BasaltButton);
  expect(buttonVariants).toBe(basaltButtonVariants);
});
