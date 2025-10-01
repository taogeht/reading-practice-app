import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getCurrentUser, hashPassword } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  users,
  schools,
  schoolMemberships,
  teachers,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

interface CsvRecord {
  [key: string]: string;
}

interface ImportResult {
  processed: number;
  created: number;
  updated: number;
  skipped: Array<{ email?: string; reason: string }>;
  generatedPasswords: Array<{ email: string; password: string }>;
}

const REQUIRED_HEADERS = ['email', 'firstName', 'lastName'];

function parseCsv(text: string): CsvRecord[] {
  const rows: CsvRecord[] = [];
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  if (lines.length === 0) {
    return rows;
  }

  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine).map((header) => header.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }
    const values = splitCsvLine(line);
    const record: CsvRecord = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    rows.push(record);
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function normalizeBoolean(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (['false', '0', 'no', 'inactive'].includes(normalized)) {
    return false;
  }
  return true;
}

function normalizeRole(value: string | undefined): 'student' | 'teacher' | 'admin' {
  const normalized = (value ?? 'student').trim().toLowerCase();
  if (normalized === 'teacher' || normalized === 'admin') {
    return normalized;
  }
  return 'student';
}

function generateTemporaryPassword(): string {
  return randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'File upload is required' },
        { status: 400 },
      );
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'The uploaded file is empty or invalid CSV.' },
        { status: 400 },
      );
    }

    const headerRow = Object.keys(rows[0]);
    const missingHeaders = REQUIRED_HEADERS.filter(
      (header) => !headerRow.some((col) => col.toLowerCase() === header.toLowerCase()),
    );

    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingHeaders.join(', ')}` },
        { status: 400 },
      );
    }

    const allSchools = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools);
    const schoolMap = new Map<string, { id: string; name: string }>();
    allSchools.forEach((school) => {
      schoolMap.set(school.name.toLowerCase(), school);
    });

    const result: ImportResult = {
      processed: rows.length,
      created: 0,
      updated: 0,
      skipped: [],
      generatedPasswords: [],
    };

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const emailRaw = row.email ?? row.Email ?? row.EMAIL;
        const email = (emailRaw || '').trim().toLowerCase();
        if (!email) {
          result.skipped.push({ reason: 'Missing email address' });
          continue;
        }

        const firstName = (row.firstName ?? row.FirstName ?? '').trim();
        const lastName = (row.lastName ?? row.LastName ?? '').trim();
        if (!firstName || !lastName) {
          result.skipped.push({ email, reason: 'Missing first or last name' });
          continue;
        }

        const role = normalizeRole(row.role ?? row.Role);
        const active = normalizeBoolean(row.active ?? row.Active);
        const schoolNameRaw = (row.schoolName ?? row.SchoolName ?? '').trim();
        const passwordFromFile = (row.password ?? row.Password ?? '').trim();

        const [existingUser] = await tx
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        const ensureSchool = async (): Promise<string | null> => {
          if (!schoolNameRaw) {
            return null;
          }
          const lookupKey = schoolNameRaw.toLowerCase();
          const cached = schoolMap.get(lookupKey);
          if (cached) {
            return cached.id;
          }
          const [newSchool] = await tx
            .insert(schools)
            .values({ name: schoolNameRaw })
            .onConflictDoNothing()
            .returning({ id: schools.id, name: schools.name });
          const record = newSchool ?? (await tx
            .select({ id: schools.id, name: schools.name })
            .from(schools)
            .where(eq(schools.name, schoolNameRaw))
            .limit(1))[0];
          if (record) {
            schoolMap.set(lookupKey, record);
            return record.id;
          }
          return null;
        };

        if (!existingUser) {
          const passwordPlain = passwordFromFile || generateTemporaryPassword();
          const passwordHash = await hashPassword(passwordPlain);

          const [newUser] = await tx
            .insert(users)
            .values({
              email,
              firstName,
              lastName,
              passwordHash,
              role,
              active,
            })
            .returning();

          if (role === 'teacher') {
            const schoolId = await ensureSchool();
            if (!schoolId) {
              result.skipped.push({ email, reason: 'Teacher missing school name' });
              await tx.delete(users).where(eq(users.id, newUser.id));
              continue;
            }

            await tx.insert(teachers).values({ id: newUser.id }).onConflictDoNothing();
            await tx
              .insert(schoolMemberships)
              .values({ userId: newUser.id, schoolId, isPrimary: true })
              .onConflictDoUpdate({
                target: [schoolMemberships.userId, schoolMemberships.schoolId],
                set: { isPrimary: true },
              });
          }

          if (!passwordFromFile) {
            result.generatedPasswords.push({ email, password: passwordPlain });
          }

          result.created += 1;

          await recordAuditEvent({
            userId: currentUser.id,
            action: 'admin.user.import.create',
            resourceType: 'user',
            resourceId: newUser.id,
            details: {
              email,
              role,
              school: schoolNameRaw || null,
            },
            request,
          });
        } else {
          const updates: Partial<typeof users.$inferInsert> = {
            firstName,
            lastName,
            active,
            updatedAt: new Date(),
          };

          if (role && role !== existingUser.role) {
            updates.role = role;
          }

          if (passwordFromFile) {
            updates.passwordHash = await hashPassword(passwordFromFile);
          }

          await tx.update(users).set(updates).where(eq(users.email, email));

          if (role === 'teacher') {
            const schoolId = await ensureSchool();
            if (schoolId) {
              await tx.insert(teachers).values({ id: existingUser.id }).onConflictDoNothing();
              await tx.delete(schoolMemberships).where(eq(schoolMemberships.userId, existingUser.id));
              await tx.insert(schoolMemberships).values({
                userId: existingUser.id,
                schoolId,
                isPrimary: true,
              });
            }
          } else if (existingUser.role === 'teacher' && role !== 'teacher') {
            await tx.delete(schoolMemberships).where(eq(schoolMemberships.userId, existingUser.id));
          }

          result.updated += 1;

          await recordAuditEvent({
            userId: currentUser.id,
            action: 'admin.user.import.update',
            resourceType: 'user',
            resourceId: existingUser.id,
            details: {
              email,
              role,
              school: schoolNameRaw || null,
              passwordChanged: Boolean(passwordFromFile),
            },
            request,
          });
        }
      }
    });

    await recordAuditEvent({
      userId: currentUser.id,
      action: 'admin.user.import',
      resourceType: 'user',
      details: {
        processed: result.processed,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped.length,
      },
      request,
    });

    return NextResponse.json({
      summary: result,
      generatedPasswords: result.generatedPasswords,
      skipped: result.skipped,
    });
  } catch (error) {
    logError(error, 'api/admin/users/import');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
