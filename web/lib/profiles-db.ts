import "server-only";

import { currentIsoTimestamp, listingDatabase as db } from "./services-db";
import type { FreelancerProfile, FreelancerProfileInput } from "./profiles-schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS freelancer_profiles (
    address TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    headline TEXT NOT NULL,
    bio TEXT NOT NULL,
    skills_json TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    hourly_rate_usd REAL NOT NULL,
    experience_years INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Upgrade a table created before experience existed. Demo rows are re-created below.
const columns = db.prepare("PRAGMA table_info(freelancer_profiles)").all() as { name: string }[];
if (!columns.some((column) => column.name === "experience_years")) {
  db.exec("ALTER TABLE freelancer_profiles ADD COLUMN experience_years INTEGER NOT NULL DEFAULT 0");
  db.exec("DELETE FROM freelancer_profiles WHERE is_demo = 1");
}

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

const seed = db.transaction(() => {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM freelancer_profiles WHERE is_demo = 1").get() as {
    count: number;
  };
  if (existing.count > 0) return;
  const insert = db.prepare(
    `INSERT INTO freelancer_profiles
     (address, display_name, headline, bio, skills_json, category, country, hourly_rate_usd, experience_years, is_demo, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  const timestamp = currentIsoTimestamp();
  demoProfiles.forEach((profile, index) => {
    insert.run(
      `0x3${"0".repeat(38)}${index + 1}`,
      profile.displayName,
      `${profile.bio} DEMO PROFILE: sample content only.`,
      profile.headline,
      JSON.stringify(profile.skills),
      profile.category,
      profile.country,
      profile.hourlyRateUsd,
      profile.experienceYears,
      timestamp,
      timestamp,
    );
  });
});
seed();

function toProfile(row: ProfileRow): FreelancerProfile {
  return {
    address: row.address,
    displayName: row.display_name,
    headline: row.headline,
    bio: row.bio,
    skills: JSON.parse(row.skills_json) as string[],
    category: row.category as FreelancerProfile["category"],
    country: row.country,
    experienceYears: row.experience_years,
    hourlyRateUsd: row.hourly_rate_usd,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProfiles(filters: {
  search?: string;
  category?: string;
  country?: string;
  minExperience?: number;
}): FreelancerProfile[] {
  const clauses: string[] = [];
  const values: Array<string | number> = [];
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
  const rows = db
    .prepare(`SELECT * FROM freelancer_profiles ${where} ORDER BY is_demo ASC, updated_at DESC LIMIT 100`)
    .all(...values) as ProfileRow[];
  return rows.map(toProfile);
}

export function saveProfile(input: FreelancerProfileInput, address: string): FreelancerProfile {
  const timestamp = currentIsoTimestamp();
  const key = address.toLowerCase();
  db.prepare(
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
  ).run(
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
  );
  const row = db.prepare("SELECT * FROM freelancer_profiles WHERE address = ?").get(key) as ProfileRow;
  return toProfile(row);
}