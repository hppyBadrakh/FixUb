"use client";

// Browser side of Better Auth. It talks to /api/auth/* on the same origin.
// Screens don't use it directly: sign-in and sign-out go through `useStore()`.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
