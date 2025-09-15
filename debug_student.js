const { db } = require('./dist/lib/db.js');
const { students, users } = require('./dist/lib/db/schema.js');

async function checkStudent() {
  try {
    const studentData = await db
      .select()
      .from(students)
      .where(eq(students.id, '1'))
      .limit(1);
    
    console.log('Student data:', JSON.stringify(studentData, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}

checkStudent();
