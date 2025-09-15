import { db } from './index';
import {
  users,
  schools,
  schoolMemberships,
  students,
  teachers,
  stories,
  classes,
  classEnrollments,
  assignments,
  systemSettings,
} from './schema';
import { hash } from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding database...');

  try {
    // Create a demo school
    const [demoSchool] = await db
      .insert(schools)
      .values({
        name: 'Riverside Elementary School',
        district: 'Metro Public School District',
        address: '123 Education Ave',
        city: 'Springfield',
        state: 'CA',
        zipCode: '90210',
      })
      .returning();

    console.log('✅ Created demo school');

    // Create admin user
    const hashedAdminPassword = await hash('admin123', 12);
    const [adminUser] = await db
      .insert(users)
      .values({
        email: 'admin@example.com',
        passwordHash: hashedAdminPassword,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'User',
      })
      .returning();

    await db.insert(schoolMemberships).values({
      userId: adminUser.id,
      schoolId: demoSchool.id,
      isPrimary: true,
    });

    console.log('✅ Created admin user');

    // Create teacher user
    const hashedTeacherPassword = await hash('teacher123', 12);
    const [teacherUser] = await db
      .insert(users)
      .values({
        email: 'sarah.johnson@example.com',
        passwordHash: hashedTeacherPassword,
        role: 'teacher',
        firstName: 'Sarah',
        lastName: 'Johnson',
      })
      .returning();

    const [teacherProfile] = await db
      .insert(teachers)
      .values({
        id: teacherUser.id,
        employeeId: 'T001',
        department: 'Elementary Education',
        subjects: ['Reading', 'Language Arts'],
      })
      .returning();

    await db.insert(schoolMemberships).values({
      userId: teacherUser.id,
      schoolId: demoSchool.id,
      isPrimary: true,
    });

    console.log('✅ Created teacher user');

    // Create sample students
    const studentData = [
      {
        firstName: 'Emma',
        lastName: 'Wilson',
        gradeLevel: 2,
        readingLevel: 'Beginning',
        visualPasswordType: 'animal' as const,
        visualPasswordData: { animal: 'cat', color: 'orange' },
        parentEmail: 'parent.wilson@example.com',
      },
      {
        firstName: 'Liam',
        lastName: 'Brown',
        gradeLevel: 2,
        readingLevel: 'Intermediate',
        visualPasswordType: 'color_shape' as const,
        visualPasswordData: { shape: 'circle', color: 'blue' },
        parentEmail: 'parent.brown@example.com',
      },
      {
        firstName: 'Olivia',
        lastName: 'Davis',
        gradeLevel: 3,
        readingLevel: 'Advanced',
        visualPasswordType: 'object' as const,
        visualPasswordData: { object: 'apple', color: 'red' },
        parentEmail: 'parent.davis@example.com',
      },
    ];

    const createdStudents = [];
    for (const student of studentData) {
      const [studentUser] = await db
        .insert(users)
        .values({
          role: 'student',
          firstName: student.firstName,
          lastName: student.lastName,
        })
        .returning();

      const [studentProfile] = await db
        .insert(students)
        .values({
          id: studentUser.id,
          gradeLevel: student.gradeLevel,
          readingLevel: student.readingLevel,
          visualPasswordType: student.visualPasswordType,
          visualPasswordData: student.visualPasswordData,
          parentEmail: student.parentEmail,
        })
        .returning();

      await db.insert(schoolMemberships).values({
        userId: studentUser.id,
        schoolId: demoSchool.id,
        isPrimary: true,
      });

      createdStudents.push({ user: studentUser, profile: studentProfile });
    }

    console.log('✅ Created sample students');

    // Create a class
    const [demoClass] = await db
      .insert(classes)
      .values({
        name: "Ms. Johnson's 2nd Grade Reading",
        description: 'Second grade reading practice and assessment',
        teacherId: teacherProfile.id,
        schoolId: demoSchool.id,
        gradeLevel: 2,
        academicYear: '2024-2025',
      })
      .returning();

    // Enroll students in the class
    for (const student of createdStudents) {
      await db.insert(classEnrollments).values({
        classId: demoClass.id,
        studentId: student.profile.id,
      });
    }

    console.log('✅ Created class and enrolled students');

    // Create sample stories with mock TTS audio URLs
    const sampleStories = [
      {
        title: 'The Little Red Hen',
        content: `Once upon a time, there was a little red hen who lived on a farm. She found some grains of wheat and asked her friends, "Who will help me plant this wheat?" But the lazy cat, dog, and pig all said, "Not I!" So the little red hen planted the wheat herself. When it was time to harvest, she asked again, "Who will help me cut the wheat?" Again, they all said, "Not I!" The little red hen did it herself. She ground the wheat into flour and baked bread. When the delicious smell filled the air, all the animals wanted to help eat it! But the little red hen said, "I will eat it myself, since I did all the work!" And she did.`,
        readingLevel: 'Beginning',
        gradeLevels: [1, 2],
        wordCount: 123,
        estimatedReadingTimeMinutes: 2,
        author: 'Folk Tale',
        genre: 'Fairy Tale',
        ttsAudioUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav', // Mock audio URL for demo
        ttsAudioDurationSeconds: 120,
        createdBy: adminUser.id,
      },
      {
        title: 'The Hungry Caterpillar',
        content: `In the light of the moon, a little egg lay on a leaf. One Sunday morning, the warm sun came up and - pop! - out of the egg came a tiny and very hungry caterpillar. He started to look for some food. On Monday, he ate through one apple. But he was still hungry. On Tuesday, he ate through two pears, but he was still hungry. On Wednesday, he ate through three plums, but he was still hungry. On Thursday, he ate through four strawberries, but he was still hungry. On Friday, he ate through five oranges, but he was still hungry. On Saturday, he ate through lots of things. That night he had a stomachache! The next day was Sunday again. The caterpillar ate through one nice green leaf, and after that he felt much better. He built a small house around himself and stayed inside for more than two weeks. Then he nibbled a hole and came out... he was a beautiful butterfly!`,
        readingLevel: 'Intermediate',
        gradeLevels: [2, 3],
        wordCount: 156,
        estimatedReadingTimeMinutes: 3,
        author: 'Eric Carle',
        genre: 'Children\'s Fiction',
        ttsAudioUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/CantinaBand60.wav', // Mock audio URL for demo
        ttsAudioDurationSeconds: 180,
        createdBy: adminUser.id,
      },
      {
        title: 'The Three Little Pigs',
        content: `Once upon a time, there were three little pigs who decided to build their own houses. The first little pig built his house out of straw because it was easy and quick. The second little pig built his house out of sticks because it was a bit stronger than straw. The third little pig built his house out of bricks because he wanted it to be very strong. One day, a big bad wolf came along and saw the first little pig's house. "Little pig, little pig, let me come in!" he called. "Not by the hair on my chinny-chin-chin!" replied the pig. "Then I'll huff and I'll puff and I'll blow your house in!" The wolf blew the straw house down easily. The pig ran to his brother's stick house. The wolf followed and blew that house down too! Both pigs ran to the brick house. The wolf tried to blow it down, but he couldn't! The three little pigs were safe, and they learned that hard work pays off.`,
        readingLevel: 'Advanced',
        gradeLevels: [2, 3, 4],
        wordCount: 187,
        estimatedReadingTimeMinutes: 4,
        author: 'Folk Tale',
        genre: 'Fairy Tale',
        ttsAudioUrl: 'https://www2.cs.uic.edu/~i101/SoundFiles/ImperialMarch60.wav', // Mock audio URL for demo
        ttsAudioDurationSeconds: 240,
        createdBy: adminUser.id,
      },
    ];

    const createdStories = [];
    for (const story of sampleStories) {
      const [createdStory] = await db.insert(stories).values(story).returning();
      createdStories.push(createdStory);
    }

    console.log('✅ Created sample stories');

    // Create sample assignments
    const [assignment1] = await db
      .insert(assignments)
      .values({
        title: 'Read "The Little Red Hen"',
        description: 'Practice reading this classic story about hard work and helping others.',
        storyId: createdStories[0].id,
        classId: demoClass.id,
        teacherId: teacherProfile.id,
        status: 'published',
        assignedAt: new Date(),
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        instructions: 'Read the story aloud clearly. Take your time and pronounce each word carefully.',
      })
      .returning();

    const [assignment2] = await db
      .insert(assignments)
      .values({
        title: 'Read "The Hungry Caterpillar"',
        description: 'Practice reading about the caterpillar\'s journey to becoming a butterfly.',
        storyId: createdStories[1].id,
        classId: demoClass.id,
        teacherId: teacherProfile.id,
        status: 'published',
        assignedAt: new Date(),
        dueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        instructions: 'Focus on reading with expression. Try to make it sound like a story!',
      })
      .returning();

    console.log('✅ Created sample assignments');

    // Insert system settings
    const defaultSettings = [
      {
        key: 'max_recording_duration_seconds',
        value: 300,
        description: 'Maximum recording length in seconds',
      },
      {
        key: 'max_file_size_mb',
        value: 50,
        description: 'Maximum audio file size in megabytes',
      },
      {
        key: 'supported_audio_formats',
        value: ['mp3', 'wav', 'm4a', 'ogg'],
        description: 'Supported audio file formats',
      },
      {
        key: 'auto_flag_low_wpm_threshold',
        value: 50,
        description: 'WPM threshold below which students are flagged',
      },
      {
        key: 'auto_flag_low_accuracy_threshold',
        value: 70,
        description: 'Accuracy percentage below which students are flagged',
      },
      {
        key: 'eleven_labs_voice_settings',
        value: {
          voice_id: 'default',
          stability: 0.5,
          similarity_boost: 0.75,
        },
        description: 'ElevenLabs TTS voice configuration',
      },
    ];

    for (const setting of defaultSettings) {
      await db
        .insert(systemSettings)
        .values({
          key: setting.key,
          value: setting.value,
          description: setting.description,
          updatedBy: adminUser.id,
        })
        .onConflictDoNothing();
    }

    console.log('✅ Created system settings');

    console.log('🎉 Database seeding completed successfully!');
    console.log('\nDemo accounts:');
    console.log('Admin: admin@example.com / admin123');
    console.log('Teacher: sarah.johnson@example.com / teacher123');
    console.log('Students use visual authentication (no password required)');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seed };