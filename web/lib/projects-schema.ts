import { isAddress } from "viem";
import { z } from "zod";

import { serviceCategories } from "./services-schema";

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

const usdAmount = z
  .number()
  .finite()
  .positive()
  .max(1_000_000)
  .refine(twoDecimals, "Use at most two decimal places.");

export const addressSchema = z
  .string()
  .refine(isAddress, "Enter a valid wallet address.")
  .transform((value) => value.toLowerCase());

export const projectInputSchema = z.object({
  title: z.string().trim().min(5, "Title needs at least 5 characters.").max(100),
  description: z.string().trim().min(20, "Description needs at least 20 characters.").max(2_000),
  category: z.enum(serviceCategories),
  country: z.string().trim().min(2, "Enter a country.").max(80),
  budgetUsd: usdAmount,
  deadlineDays: z.number().int("Use whole days.").min(1).max(365),
});

export const applicationInputSchema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(10, "Message needs at least 10 characters.").max(1_000),
  proposedPriceUsd: usdAmount,
  deliveryDays: z.number().int("Use whole days.").min(1).max(365),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export type Project = ProjectInput & {
  id: string;
  ownerAddress: string;
  isDemo: boolean;
  status: "open" | "closed";
  createdAt: string;
  applicationCount: number;
};

export type ProjectApplication = {
  id: string;
  projectId: string;
  applicantAddress: string;
  message: string;
  proposedPriceUsd: number;
  deliveryDays: number;
  createdAt: string;
};