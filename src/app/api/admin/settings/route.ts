import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { systemSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allSettings = await db.select().from(systemSettings).orderBy(systemSettings.key);

    return NextResponse.json({ settings: allSettings });

  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: 'Settings must be an array' }, { status: 400 });
    }

    // Update all settings
    const updatedSettings = [];
    for (const setting of settings) {
      const { key, value, description } = setting;
      
      if (!key) {
        continue; // Skip invalid settings
      }

      // Try to parse value as JSON, otherwise keep as string
      let parsedValue;
      try {
        parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        parsedValue = value;
      }

      // Check if setting exists
      const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
      
      let result;
      if (existing.length > 0) {
        // Update existing setting
        result = await db.update(systemSettings)
          .set({
            value: parsedValue,
            description: description || existing[0].description,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, key))
          .returning();
      } else {
        // Insert new setting
        result = await db.insert(systemSettings)
          .values({
            key,
            value: parsedValue,
            description: description || null,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .returning();
      }

      updatedSettings.push(result[0]);
    }

    return NextResponse.json({ settings: updatedSettings, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
