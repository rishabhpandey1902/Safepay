import "server-only";

import { dbAll, dbGet, dbRun } from "./db";
import type { FreelancerProfile, FreelancerProfileInput } from "./profiles-schema";

type ProfileRow = {
  address: string;
  display_name: string;
  headline: string;
  bio: string;
  skills_json: string;
  category: string;
  country: string;
  hourly_rate_usd: number;
  experience_years: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
};

const demoProfiles: FreelancerProfileInput[] = [
  {
    displayName: "Ana Silva",
    headline: "Brand designer for small businesses",
    bio: "I design logos, colour palettes and simple brand guides for cafes, shops and new startups.",
    skills: ["Logo design", "Branding", "Figma"],
    category: "Design",
    country: "Brazil",
    experienceYears: 6,
    hourlyRateUsd: 25,
  },
  {
    displayName: "Daniel Okoye",
    headline: "Full-stack web developer",
    bio: "I build fast, mobile-friendly websites and web apps with React, Next.js and Node.js.",
    skills: ["React", "Next.js", "Node.js"],
    category: "Development",
    country: "Nigeria",
    experienceYears: 8,
    hourlyRateUsd: 35,
  },
  {
    displayName: "Priya Nair",
    headline: "Content writer and editor",
    bio: "I write clear website copy, blog posts and product descriptions in a friendly, professional tone.",
    skills: ["Copywriting", "Blogging", "Editing"],
    category: "Writing",
    country: "India",
    experienceYears: 4,
    hourlyRateUsd: 18,
  },
  {
    displayName: "Lukas Meyer",
    headline: "Short-form video editor",
    bio: "I edit social videos and product walkthroughs from your footage, with captions and music.",
    skills: ["Video editing", "Captions", "Social media"],
    category: "Video",
    country: "Germany",
    experienceYears: 5,
    hourlyRateUsd: 30,
  },
  {
    displayName: "Sofia Rossi",
    headline: "Social media and launch marketer",
    bio: "I plan and run launch campaigns, content calendars and paid social for small brands.",
    skills: ["Social media", "Campaigns", "Analytics"],
    category: "Marketing",
    country: "Italy",
    experienceYears: 9,
    hourlyRateUsd: 40,
  },
  {
    displayName: "Omar Haddad",
    headline: "Business analyst and consultant",
    bio: "I help small teams run customer discovery, map processes and write clear project plans.",
    skills: ["Research", "Process mapping", "Planning"],
    category: "Business",
    country: "United Arab Emirates",
    experienceYears: 12,
    hourlyRateUsd: 55,
  },
];

let seeded: Promise<void> | undefined;

function ensureSeed(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const timestamp = new Date().toISOString();
      for (let index = 0; index < demoProfiles.length; index += 1) {
        const profile = demoProfiles[index];
        await dbRun(
          `INSERT OR IGNORE INTO freelancer_profiles
           (address, display_name, headline, bio, skills_json, category, country, hourly_rate_usd, experience_years, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            `0x3${"0".repeat(38)}${index + 1}`,
            profile.displayName,
            profile.headline,
            `${profile.bio} DEMO PROFILE: sample content only.`,
            JSON.stringify(profile.skills),
            profile.category,
            profile.country,
            profile.hourlyRateUsd,
            profile.experienceYears,
            timestamp,
            timestamp,
          ],
        );
      }
    })().catch((error: unknown) => {
      seeded = undefined;
      throw error;
    });
  }
  return seeded;
}

function toProfile(row: ProfileRow): FreelancerProfile {
  return {
    address: row.address,
    displayName: row.display_name,
    headline: row.headline,
    bio: row.bio,
    skills: JSON.parse(row.skills_json) as string[],
    category: row.category as FreelancerProfile["category"],
    country: row.country,
    experienceYears: Number(row.experience_years),
    hourlyRateUsd: Number(row.hourly_rate_usd),
    isDemo: Number(row.is_demo) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProfiles(filters: {
  search?: string;
  category?: string;
  country?: string;
  minExperience?: number;
}): Promise<FreelancerProfile[]> {
  await ensureSeed();
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (filters.search) {
    clauses.push("(display_name LIKE ? OR headline LIKE ? OR skills_json LIKE ?)");
    const like = `%${filters.search}%`;
    values.push(like, like, like);
  }
  if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
  }
  if (filters.country) {
    clauses.push("country LIKE ?");
    values.push(`%${filters.country}%`);
  }
  if (filters.minExperience !== undefined && filters.minExperience > 0) {
    clauses.push("experience_years >= ?");
    values.push(filters.minExperience);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await dbAll<ProfileRow>(
    `SELECT * FROM freelancer_profiles ${where} ORDER BY is_demo ASC, updated_at DESC LIMIT 100`,
    values,
  );
  return rows.map(toProfile);
}

export async function saveProfile(input: FreelancerProfileInput, address: string): Promise<FreelancerProfile> {
  await ensureSeed();
  const timestamp = new Date().toISOString();
  const key = address.toLowerCase();
  await dbRun(
    `INSERT INTO freelancer_profiles
     (address, display_name, headline, bio, skills_json, category, country, hourly_rate_usd, experience_years, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       display_name = excluded.display_name,
       headline = excluded.headline,
       bio = excluded.bio,
       skills_json = excluded.skills_json,
       category = excluded.category,
       country = excluded.country,
       hourly_rate_usd = excluded.hourly_rate_usd,
       experience_years = excluded.experience_years,
       updated_at = excluded.updated_at`,
    [
      key,
      input.displayName,
      input.headline,
      input.bio,
      JSON.stringify(input.skills),
      input.category,
      input.country,
      input.hourlyRateUsd,
      input.experienceYears,
      timestamp,
      timestamp,
    ],
  );
  const row = await dbGet<ProfileRow>("SELECT * FROM freelancer_profiles WHERE address = ?", [key]);
  if (!row) throw new Error("The profile could not be saved.");
  return toProfile(row);
}