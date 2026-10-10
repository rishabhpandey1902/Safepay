import "server-only";

import { randomUUID } from "node:crypto";

import { currentIsoTimestamp, listingDatabase as db } from "./services-db";
import type {
  ApplicationInput,
  Project,
  ProjectApplication,
  ProjectInput,
} from "./projects-schema";

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    budget_usd REAL NOT NULL,
    deadline_days INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_applications (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    applicant_address TEXT NOT NULL,
    message TEXT NOT NULL,
    proposed_price_usd REAL NOT NULL,
    delivery_days INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (project_id, applicant_address)
  );
  CREATE TABLE IF NOT EXISTS project_nonces (
    nonce TEXT PRIMARY KEY,
    address TEXT NOT NULL,
    action TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

type ProjectRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  country: string;
  budget_usd: number;
  deadline_days: number;
  owner_address: string;
  status: string;
  is_demo: number;
  created_at: string;
  application_count: number;
};

type ApplicationRow = {
  id: string;
  project_id: string;
  applicant_address: string;
  message: string;
  proposed_price_usd: number;
  delivery_days: number;
  created_at: string;
};

const demoProjects: ProjectInput[] = [
  {
    title: "Redesign our bakery's ordering website",
    description: "We need a clean, mobile-friendly ordering page for a small bakery, with a menu, photos and a simple order form.",
    category: "Development",
    country: "United Kingdom",
    budgetUsd: 900,
    deadlineDays: 21,
  },
  {
    title: "Logo and brand colours for a new cafe",
    description: "Looking for a logo, colour palette and simple brand guide for a cafe opening next month.",
    category: "Design",
    country: "India",
    budgetUsd: 300,
    deadlineDays: 10,
  },
  {
    title: "Write five blog posts about home renovation",
    description: "Five 800-word articles about home renovation for a construction company website, with a friendly tone.",
    category: "Writing",
    country: "United Arab Emirates",
    budgetUsd: 250,
    deadlineDays: 14,
  },
];

const seed = db.transaction(() => {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE is_demo = 1").get() as { count: number };
  if (existing.count > 0) return;
  const insert = db.prepare(
    `INSERT INTO projects
     (id, title, description, category, country, budget_usd, deadline_days, owner_address, status, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?)`,
  );
  const timestamp = currentIsoTimestamp();
  demoProjects.forEach((project, index) => {
    insert.run(
      `00000000-0000-4000-8000-00000000000${index + 1}`,
      project.title,
      `${project.description} DEMO PROJECT: sample content only.`,
      project.category,
      project.country,
      project.budgetUsd,
      project.deadlineDays,
      `0x200000000000000000000000000000000000000${index + 1}`,
      timestamp,
    );
  });
});
seed();

const projectSelect = `
  SELECT p.*, (SELECT COUNT(*) FROM project_applications a WHERE a.project_id = p.id) AS application_count
  FROM projects p
`;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as Project["category"],
    country: row.country,
    budgetUsd: row.budget_usd,
    deadlineDays: row.deadline_days,
    ownerAddress: row.owner_address,
    status: row.status === "closed" ? "closed" : "open",
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    applicationCount: row.application_count,
  };
}

function toApplication(row: ApplicationRow): ProjectApplication {
  return {
    id: row.id,
    projectId: row.project_id,
    applicantAddress: row.applicant_address,
    message: row.message,
    proposedPriceUsd: row.proposed_price_usd,
    deliveryDays: row.delivery_days,
    createdAt: row.created_at,
  };
}

export function listProjects(filters: { search?: string; category?: string; country?: string }): Project[] {
  const clauses: string[] = [];
  const values: string[] = [];
  if (filters.search) {
    clauses.push("(p.title LIKE ? OR p.description LIKE ?)");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.category) {
    clauses.push("p.category = ?");
    values.push(filters.category);
  }
  if (filters.country) {
    clauses.push("p.country = ?");
    values.push(filters.country);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`${projectSelect} ${where} ORDER BY p.is_demo ASC, p.created_at DESC LIMIT 100`)
    .all(...values) as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: string): Project | undefined {
  const row = db.prepare(`${projectSelect} WHERE p.id = ?`).get(id) as ProjectRow | undefined;
  return row ? toProject(row) : undefined;
}

export function listApplications(projectId: string): ProjectApplication[] {
  const rows = db
    .prepare("SELECT * FROM project_applications WHERE project_id = ? ORDER BY created_at ASC")
    .all(projectId) as ApplicationRow[];
  return rows.map(toApplication);
}

export function createProject(input: ProjectInput, ownerAddress: string): Project {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO projects
     (id, title, description, category, country, budget_usd, deadline_days, owner_address, status, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)`,
  ).run(
    id,
    input.title,
    input.description,
    input.category,
    input.country,
    input.budgetUsd,
    input.deadlineDays,
    ownerAddress.toLowerCase(),
    currentIsoTimestamp(),
  );
  return getProject(id) as Project;
}

export function createApplication(
  input: ApplicationInput,
  applicantAddress: string,
): { ok: true; application: ProjectApplication } | { ok: false; error: string; status: number } {
  const project = getProject(input.projectId);
  if (!project) return { ok: false, error: "Project not found.", status: 404 };
  if (project.status !== "open") return { ok: false, error: "This project is closed.", status: 400 };
  if (project.ownerAddress === applicantAddress.toLowerCase()) {
    return { ok: false, error: "You cannot apply to your own project.", status: 400 };
  }
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO project_applications
       (id, project_id, applicant_address, message, proposed_price_usd, delivery_days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      applicantAddress.toLowerCase(),
      input.message,
      input.proposedPriceUsd,
      input.deliveryDays,
      currentIsoTimestamp(),
    );
  } catch {
    return { ok: false, error: "You already applied to this project.", status: 409 };
  }
  const row = db.prepare("SELECT * FROM project_applications WHERE id = ?").get(id) as ApplicationRow;
  return { ok: true, application: toApplication(row) };
}