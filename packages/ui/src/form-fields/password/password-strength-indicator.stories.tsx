/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { PasswordStrengthIndicator } from "./indicator";

const meta: Meta<typeof PasswordStrengthIndicator> = {
  title: "Form fields/Password strength",
  component: PasswordStrengthIndicator,
};

export default meta;
type Story = StoryObj<typeof PasswordStrengthIndicator>;

export const Empty: Story = {
  args: { password: "" },
};

export const TooEasy: Story = {
  args: { password: "Password1!" },
};

export const Passphrase: Story = {
  args: { password: "correct horse battery staple extra" },
};

export const TypeToAssess: Story = {
  args: { password: "" },
  render: function TypeToAssessStory() {
    const [password, setPassword] = React.useState("");
    return (
      <div className="w-80 space-y-3">
        <input
          className="w-full rounded-md border border-strong bg-surface-1 px-3 py-2 text-13"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Type a password"
        />
        <PasswordStrengthIndicator password={password} />
      </div>
    );
  },
};
