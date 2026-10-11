import "server-only";

import { randomUUID } from "node:crypto";

import { dbAll, dbGet, dbRun } from "./db";
import type {
  ApplicationInput,
  Project,
  ProjectApplication,
  ProjectInput,
} from "./projects-schema";

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

let seeded: Promise<void> | undefined;

function ensureSeed(): Promise<void> {
  if (!seeded) {
    seeded = (async () => {
      const timestamp = new Date().toISOString();
      for (let index = 0; index < demoProjects.length; index += 1) {
        const project = demoProjects[index];
        await dbRun(
          `INSERT OR IGNORE INTO projects
           (id, title, description, category, country, budget_usd, deadline_days, owner_address, status, is_demo, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?)`,
          [
            `00000000-0000-4000-8000-00000000000${index + 1}`,
            project.title,
            `${project.description} DEMO PROJECT: sample content only.`,
            project.category,
            project.country,
            project.budgetUsd,
            project.deadlineDays,
            `0x2${"0".repeat(38)}${index + 1}`,
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
    budgetUsd: Number(row.budget_usd),
    deadlineDays: Number(row.deadline_days),
    ownerAddress: row.owner_address,
    status: row.status === "closed" ? "closed" : "open",
    isDemo: Number(row.is_demo) === 1,
    createdAt: row.created_at,
    applicationCount: Number(row.application_count),
  };
}

function toApplication(row: ApplicationRow): ProjectApplication {
  return {
    id: row.id,
    projectId: row.project_id,
    applicantAddress: row.applicant_address,
    message: row.message,
    proposedPriceUsd: Number(row.proposed_price_usd),
    deliveryDays: Number(row.delivery_days),
    createdAt: row.created_at,
  };
}

export async function listProjects(filters: {
  search?: string;
  category?: string;
  country?: string;
}): Promise<Project[]> {
  await ensureSeed();
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
  const rows = await dbAll<ProjectRow>(
    `${projectSelect} ${where} ORDER BY p.is_demo ASC, p.created_at DESC LIMIT 100`,
    values,
  );
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<Project | undefined> {
  await ensureSeed();
  const row = await dbGet<ProjectRow>(`${projectSelect} WHERE p.id = ?`, [id]);
  return row ? toProject(row) : undefined;
}

export async function listApplications(projectId: string): Promise<ProjectApplication[]> {
  const rows = await dbAll<ApplicationRow>(
    "SELECT * FROM project_applications WHERE project_id = ? ORDER BY created_at ASC",
    [projectId],
  );
  return rows.map(toApplication);
}

export async function createProject(input: ProjectInput, ownerAddress: string): Promise<Project> {
  await ensureSeed();
  const id = randomUUID();
  await dbRun(
    `INSERT INTO projects
     (id, title, description, category, country, budget_usd, deadline_days, owner_address, status, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)`,
    [
      id,
      input.title,
      input.description,
      input.category,
      input.country,
      input.budgetUsd,
      input.deadlineDays,
      ownerAddress.toLowerCase(),
      new Date().toISOString(),
    ],
  );
  const created = await getProject(id);
  if (!created) throw new Error("The project could not be saved.");
  return created;
}

export async function createApplication(
  input: ApplicationInput,
  applicantAddress: string,
): Promise<{ ok: true; application: ProjectApplication } | { ok: false; error: string; status: number }> {
  const project = await getProject(input.projectId);
  if (!project) return { ok: false, error: "Project not found.", status: 404 };
  if (project.status !== "open") return { ok: false, error: "This project is closed.", status: 400 };
  if (project.ownerAddress === applicantAddress.toLowerCase()) {
    return { ok: false, error: "You cannot apply to your own project.", status: 400 };
  }
  const id = randomUUID();
  try {
    await dbRun(
      `INSERT INTO project_applications
       (id, project_id, applicant_address, message, proposed_price_usd, delivery_days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.projectId,
        applicantAddress.toLowerCase(),
        input.message,
        input.proposedPriceUsd,
        input.deliveryDays,
        new Date().toISOString(),
      ],
    );
  } catch {
    return { ok: false, error: "You already applied to this project.", status: 409 };
  }
  const row = await dbGet<ApplicationRow>("SELECT * FROM project_applications WHERE id = ?", [id]);
  if (!row) return { ok: false, error: "Could not save your application.", status: 500 };
  return { ok: true, application: toApplication(row) };
}