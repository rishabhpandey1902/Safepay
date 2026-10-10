import { z } from "zod";

import { serviceCategories } from "./services-schema";

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(60),
  headline: z.string().trim().min(5, "Headline needs at least 5 characters.").max(100),
  bio: z.string().trim().min(20, "About needs at least 20 characters.").max(1_500),
  skills: z
    .array(z.string().trim().min(2, "Skills need at least 2 characters.").max(30))
    .min(1, "Add at least one skill.")
    .max(10, "Add 10 skills or fewer."),
  category: z.enum(serviceCategories),
  country: z.string().trim().min(2, "Enter your country.").max(80),
  experienceYears: z
    .number()
    .int("Use whole years.")
    .min(0, "Experience cannot be negative.")
    .max(60, "Enter 60 years or fewer."),
  hourlyRateUsd: z
    .number()
    .finite()
    .positive("Enter your rate.")
    .max(10_000)
    .refine(twoDecimals, "Use at most two decimal places."),
});

export type FreelancerProfileInput = z.infer<typeof profileInputSchema>;

export type FreelancerProfile = FreelancerProfileInput & {
  address: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};