import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  pgEnum,
  jsonb,
  decimal,
  bigint,
  inet,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['student', 'teacher', 'admin']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['draft', 'published', 'archived']);
export const recordingStatusEnum = pgEnum('recording_status', ['pending', 'submitted', 'reviewed', 'flagged']);
export const visualPasswordTypeEnum = pgEnum('visual_password_type', ['animal', 'object']);
export const mediaTypeEnum = pgEnum('media_type', ['video', 'photo', 'audio']);

// Core tables
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRoleEnum('role').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    active: boolean('active').default(true),
    loginToken: varchar('login_token', { length: 64 }).unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  }
);

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  district: varchar('district', { length: 255 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const schoolMemberships = pgTable(
  'school_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueUserSchool: uniqueIndex('unique_user_school').on(table.userId, table.schoolId),
  })
);

export const students = pgTable('students', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  gradeLevel: integer('grade_level'),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  visualPasswordType: visualPasswordTypeEnum('visual_password_type'),
  visualPasswordData: jsonb('visual_password_data'),
  parentEmail: varchar('parent_email', { length: 255 }),
  readingLevel: varchar('reading_level', { length: 50 }),
  oupEmail: varchar('oup_email', { length: 255 }),
  oupPassword: varchar('oup_password', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const teachers = pgTable('teachers', {
  id: uuid('id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  employeeId: varchar('employee_id', { length: 100 }),
  department: varchar('department', { length: 100 }),
  subjects: text('subjects').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    readingLevel: varchar('reading_level', { length: 50 }),
    gradeLevels: integer('grade_levels').array().default([]),
    wordCount: integer('word_count'),
    estimatedReadingTimeMinutes: integer('estimated_reading_time_minutes'),
    author: varchar('author', { length: 255 }),
    genre: varchar('genre', { length: 100 }),
    ttsAudio: jsonb('tts_audio').default(sql`'[]'::jsonb`).notNull(),
    active: boolean('active').default(true),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    readingLevelIdx: index('idx_stories_reading_level').on(table.readingLevel),
    activeIdx: index('idx_stories_active').on(table.active),
  })
);

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  teacherId: uuid('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  gradeLevel: integer('grade_level'),
  academicYear: varchar('academic_year', { length: 20 }),
  active: boolean('active').default(true),
  showPracticeStories: boolean('show_practice_stories').default(false),
  syllabusUrl: varchar('syllabus_url', { length: 500 }),
  currentUnit: integer('current_unit').default(1).notNull(),
  // When true, the class's students see /student/leaderboard. Off by default
  // so existing classes stay quiet until the teacher opts in.
  leaderboardEnabled: boolean('leaderboard_enabled').default(false).notNull(),
  // When false, the class is excluded from teacher login-activity dashboards.
  // Useful for classes (e.g. kindergarten) used only for attendance/syllabus
  // tracking where students never log in themselves.
  trackLoginActivity: boolean('track_login_activity').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassStudent: uniqueIndex('unique_class_student').on(table.classId, table.studentId),
  })
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'restrict' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    status: assignmentStatusEnum('status').default('draft'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    maxAttempts: integer('max_attempts').default(3),
    instructions: text('instructions'),
    // 'teacher_review' (default, current behavior) | 'ai_graded' (Whisper-based
    // auto-grading). Opt-in per assignment; the option is also gated by the
    // ENABLE_AI_GRADING env flag at creation time and at trigger time.
    recordingMode: varchar('recording_mode', { length: 20 }).default('teacher_review').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_assignments_class_id').on(table.classId),
    teacherIdIdx: index('idx_assignments_teacher_id').on(table.teacherId),
    statusIdx: index('idx_assignments_status').on(table.status),
    dueAtIdx: index('idx_assignments_due_at').on(table.dueAt),
  })
);

export const recordings = pgTable(
  'recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    audioUrl: varchar('audio_url', { length: 500 }).notNull(),
    audioDurationSeconds: integer('audio_duration_seconds'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    attemptNumber: integer('attempt_number').default(1),
    status: recordingStatusEnum('status').default('pending'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => teachers.id),
    teacherFeedback: text('teacher_feedback'),
    automatedFlags: jsonb('automated_flags'),
    wpmScore: decimal('wpm_score', { precision: 5, scale: 2 }),
    accuracyScore: decimal('accuracy_score', { precision: 5, scale: 2 }),
    // Populated only for ai_graded assignments after Whisper analysis completes.
    transcript: text('transcript'),
    analysisJson: jsonb('analysis_json'),
    letterGrade: varchar('letter_grade', { length: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueAttempt: uniqueIndex('idx_recordings_unique_attempt').on(
      table.assignmentId,
      table.studentId,
      table.attemptNumber
    ),
    studentIdIdx: index('idx_recordings_student_id').on(table.studentId),
    assignmentIdIdx: index('idx_recordings_assignment_id').on(table.assignmentId),
    statusIdx: index('idx_recordings_status').on(table.status),
    submittedAtIdx: index('idx_recordings_submitted_at').on(table.submittedAt),
  })
);

export const studentProgress = pgTable(
  'student_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    assignmentId: uuid('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
    recordingId: uuid('recording_id').references(() => recordings.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    bestWpmScore: decimal('best_wpm_score', { precision: 5, scale: 2 }),
    bestAccuracyScore: decimal('best_accuracy_score', { precision: 5, scale: 2 }),
    totalAttempts: integer('total_attempts').default(0),
    timeSpentMinutes: integer('time_spent_minutes').default(0),
    flaggedForReview: boolean('flagged_for_review').default(false),
    teacherNotes: text('teacher_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueStudentAssignment: uniqueIndex('unique_student_assignment').on(table.studentId, table.assignmentId),
  })
);

export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: uuid('resource_id'),
    details: jsonb('details'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_audit_logs_user_id').on(table.userId),
    actionIdx: index('idx_audit_logs_action').on(table.action),
    createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
  })
);

// Spelling Lists - Weekly spelling word lists for classes
export const spellingLists = pgTable(
  'spelling_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    weekNumber: integer('week_number'),
    gradeLevel: integer('grade_level'),
    isPublic: boolean('is_public').default(false),
    isCurrent: boolean('is_current').default(false).notNull(),
    active: boolean('active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_spelling_lists_class_id').on(table.classId),
    activeIdx: index('idx_spelling_lists_active').on(table.active),
    isPublicIdx: index('idx_spelling_lists_is_public').on(table.isPublic),
    gradeLevelIdx: index('idx_spelling_lists_grade_level').on(table.gradeLevel),
    isCurrentIdx: index('idx_spelling_lists_is_current').on(table.classId, table.isCurrent),
  })
);

// Spelling Words - Individual words in a spelling list with TTS audio
export const spellingWords = pgTable(
  'spelling_words',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spellingListId: uuid('spelling_list_id').notNull().references(() => spellingLists.id, { onDelete: 'cascade' }),
    word: varchar('word', { length: 100 }).notNull(),
    syllables: jsonb('syllables').$type<string[]>(), // Array of syllables: ["ba", "na", "na"]
    audioUrl: varchar('audio_url', { length: 500 }),
    imageUrl: varchar('image_url', { length: 500 }),
    mandarinTranslation: varchar('mandarin_translation', { length: 100 }),
    orderIndex: integer('order_index').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    listIdIdx: index('idx_spelling_words_list_id').on(table.spellingListId),
    orderIdx: index('idx_spelling_words_order').on(table.spellingListId, table.orderIndex),
  })
);

// Spelling Game Results - Tracks each snowman game round
export const spellingGameResults = pgTable(
  'spelling_game_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    spellingWordId: uuid('spelling_word_id').notNull().references(() => spellingWords.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    won: boolean('won').notNull(),
    wrongGuesses: integer('wrong_guesses').notNull().default(0),
    guessedLetters: jsonb('guessed_letters').$type<string[]>(),
    activityType: varchar('activity_type', { length: 30 }).default('snowman'),
    timeSeconds: integer('time_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    studentIdIdx: index('idx_game_results_student_id').on(table.studentId),
    wordIdIdx: index('idx_game_results_word_id').on(table.spellingWordId),
    classIdIdx: index('idx_game_results_class_id').on(table.classId),
    classWordIdx: index('idx_game_results_class_word').on(table.classId, table.spellingWordId),
  })
);

// Attendance Status Enum
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'excused'
]);

// Class Schedule - Which days each class meets
export const classSchedules = pgTable(
  'class_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(), // 0=Sunday, 1=Monday, ... 6=Saturday
    startTime: varchar('start_time', { length: 10 }), // "13:30", "14:00", etc.
    endTime: varchar('end_time', { length: 10 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_class_schedules_class_id').on(table.classId),
    uniqueClassDay: uniqueIndex('unique_class_day').on(table.classId, table.dayOfWeek),
  })
);

// Attendance Records - Daily attendance per student per class
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    status: attendanceStatusEnum('status').notNull().default('present'),
    notes: text('notes'),
    makeupCompleted: boolean('makeup_completed').default(false),
    makeupCompletedAt: timestamp('makeup_completed_at', { withTimezone: true }),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_attendance_class_id').on(table.classId),
    studentIdIdx: index('idx_attendance_student_id').on(table.studentId),
    dateIdx: index('idx_attendance_date').on(table.date),
    uniqueAttendance: uniqueIndex('unique_attendance_record').on(table.classId, table.studentId, table.date),
  })
);

// Student Media - Videos, photos, and audio uploaded by teachers/admins to student accounts
export const studentMedia = pgTable(
  'student_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    uploadedById: uuid('uploaded_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mediaType: mediaTypeEnum('media_type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    fileKey: varchar('file_key', { length: 500 }).notNull(),
    fileUrl: varchar('file_url', { length: 500 }).notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    thumbnailKey: varchar('thumbnail_key', { length: 500 }),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    studentIdIdx: index('idx_student_media_student_id').on(table.studentId),
    uploadedByIdx: index('idx_student_media_uploaded_by').on(table.uploadedById),
    createdAtIdx: index('idx_student_media_created_at').on(table.createdAt),
  })
);

// Books - Materials managed by super admin
export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    publisher: varchar('publisher', { length: 255 }),
    isbn: varchar('isbn', { length: 50 }),
    totalPages: integer('total_pages'),
    gradeLevels: integer('grade_levels').array(), // Array of grade levels this book is for
    subject: varchar('subject', { length: 100 }), // e.g., 'Reading', 'Phonics'
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    active: boolean('active').default(true),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    activeIdx: index('idx_books_active').on(table.active),
  })
);

// Class Books - Which books are assigned to each class
export const classBooks = pgTable(
  'class_books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
    isCurrent: boolean('is_current').default(true), // Currently being used
  },
  (table) => ({
    classIdIdx: index('idx_class_books_class_id').on(table.classId),
    uniqueClassBook: uniqueIndex('unique_class_book').on(table.classId, table.bookId),
  })
);

// Class Progress - Daily progress tracking for each class
export const classProgress = pgTable(
  'class_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    pagesCompleted: varchar('pages_completed', { length: 100 }), // e.g., "12-15", "23, 25-27"
    lessonNotes: text('lesson_notes'),
    homeworkAssigned: text('homework_assigned'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_class_progress_class_id').on(table.classId),
    bookIdIdx: index('idx_class_progress_book_id').on(table.bookId),
    dateIdx: index('idx_class_progress_date').on(table.date),
  })
);

// Syllabus Weeks - Mapping weeks to dates for a class
export const classSyllabusWeeks = pgTable(
  'class_syllabus_weeks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    title: varchar('title', { length: 255 }), // e.g., "Week 1", "09/01-09/05"
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    classIdIdx: index('idx_syllabus_weeks_class_id').on(table.classId),
    uniqueClassWeek: uniqueIndex('unique_class_week').on(table.classId, table.weekNumber),
  })
);

// Syllabus Assignments - Mapping books/pages to a specific week
export const classSyllabusAssignments = pgTable(
  'class_syllabus_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekId: uuid('week_id').notNull().references(() => classSyllabusWeeks.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    pages: varchar('pages', { length: 100 }), // e.g., "4-7", "1-3, 5"
  },
  (table) => ({
    weekIdIdx: index('idx_syllabus_assignments_week_id').on(table.weekId),
    uniqueWeekBook: uniqueIndex('unique_week_book').on(table.weekId, table.bookId),
  })
);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  student: one(students, { fields: [users.id], references: [students.id] }),
  teacher: one(teachers, { fields: [users.id], references: [teachers.id] }),
  schoolMemberships: many(schoolMemberships),
  createdStories: many(stories),
  auditLogs: many(auditLogs),
  sessions: many(session),
}));

export const schoolsRelations = relations(schools, ({ many }) => ({
  memberships: many(schoolMemberships),
  classes: many(classes),
}));

export const schoolMembershipsRelations = relations(schoolMemberships, ({ one }) => ({
  user: one(users, { fields: [schoolMemberships.userId], references: [users.id] }),
  school: one(schools, { fields: [schoolMemberships.schoolId], references: [schools.id] }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(users, { fields: [students.id], references: [users.id] }),
  enrollments: many(classEnrollments),
  recordings: many(recordings),
  progress: many(studentProgress),
  media: many(studentMedia),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  user: one(users, { fields: [teachers.id], references: [users.id] }),
  classes: many(classes),
  assignments: many(assignments),
  reviewedRecordings: many(recordings),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  creator: one(users, { fields: [stories.createdBy], references: [users.id] }),
  assignments: many(assignments),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  teacher: one(teachers, { fields: [classes.teacherId], references: [teachers.id] }),
  school: one(schools, { fields: [classes.schoolId], references: [schools.id] }),
  enrollments: many(classEnrollments),
  assignments: many(assignments),
  spellingLists: many(spellingLists),
  syllabusWeeks: many(classSyllabusWeeks),
}));

export const classEnrollmentsRelations = relations(classEnrollments, ({ one }) => ({
  class: one(classes, { fields: [classEnrollments.classId], references: [classes.id] }),
  student: one(students, { fields: [classEnrollments.studentId], references: [students.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  story: one(stories, { fields: [assignments.storyId], references: [stories.id] }),
  class: one(classes, { fields: [assignments.classId], references: [classes.id] }),
  teacher: one(teachers, { fields: [assignments.teacherId], references: [teachers.id] }),
  recordings: many(recordings),
  progress: many(studentProgress),
}));

export const recordingsRelations = relations(recordings, ({ one }) => ({
  assignment: one(assignments, { fields: [recordings.assignmentId], references: [assignments.id] }),
  student: one(students, { fields: [recordings.studentId], references: [students.id] }),
  reviewer: one(teachers, { fields: [recordings.reviewedBy], references: [teachers.id] }),
}));

export const studentProgressRelations = relations(studentProgress, ({ one }) => ({
  student: one(students, { fields: [studentProgress.studentId], references: [students.id] }),
  assignment: one(assignments, { fields: [studentProgress.assignmentId], references: [assignments.id] }),
  recording: one(recordings, { fields: [studentProgress.recordingId], references: [recordings.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const studentMediaRelations = relations(studentMedia, ({ one }) => ({
  student: one(students, { fields: [studentMedia.studentId], references: [students.id] }),
  uploadedBy: one(users, { fields: [studentMedia.uploadedById], references: [users.id] }),
}));

export const spellingListsRelations = relations(spellingLists, ({ one, many }) => ({
  class: one(classes, { fields: [spellingLists.classId], references: [classes.id] }),
  words: many(spellingWords),
}));

export const spellingWordsRelations = relations(spellingWords, ({ one, many }) => ({
  spellingList: one(spellingLists, { fields: [spellingWords.spellingListId], references: [spellingLists.id] }),
  gameResults: many(spellingGameResults),
  sentences: many(spellingWordSentences),
}));

// Spelling Word Sentences - Cached generated sentences for fill-in-the-blank activities
export const spellingWordSentences = pgTable('spelling_word_sentences', {
    id: uuid('id').defaultRandom().primaryKey(),
    spellingWordId: uuid('spelling_word_id').references(() => spellingWords.id, { onDelete: 'cascade' }).notNull(),
    gradeLevel: integer('grade_level').notNull(),
    sentence: text('sentence').notNull(),
    answer: varchar('answer', { length: 100 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const spellingWordSentencesRelations = relations(spellingWordSentences, ({ one }) => ({
    word: one(spellingWords, {
        fields: [spellingWordSentences.spellingWordId],
        references: [spellingWords.id],
    }),
}));

export const spellingGameResultsRelations = relations(spellingGameResults, ({ one }) => ({
  student: one(users, { fields: [spellingGameResults.studentId], references: [users.id] }),
  spellingWord: one(spellingWords, { fields: [spellingGameResults.spellingWordId], references: [spellingWords.id] }),
  class: one(classes, { fields: [spellingGameResults.classId], references: [classes.id] }),
}));

export const classSyllabusWeeksRelations = relations(classSyllabusWeeks, ({ one, many }) => ({
  class: one(classes, { fields: [classSyllabusWeeks.classId], references: [classes.id] }),
  assignments: many(classSyllabusAssignments),
}));

export const classSyllabusAssignmentsRelations = relations(classSyllabusAssignments, ({ one }) => ({
  week: one(classSyllabusWeeks, { fields: [classSyllabusAssignments.weekId], references: [classSyllabusWeeks.id] }),
  book: one(books, { fields: [classSyllabusAssignments.bookId], references: [books.id] }),
}));

// Practice Questions — AI-generated question bank per unit, reviewed by teachers
export const practiceQuestions = pgTable(
  'practice_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Book identifier — every book has its own units 1..N, so unit alone isn't
    // unique across the curriculum. Existing rows are all Family and Friends 1.
    bookSlug: varchar('book_slug', { length: 50 }).notNull().default('family-friends-1'),
    unit: integer('unit').notNull(),
    questionType: varchar('question_type', { length: 30 }).notNull().default('fill_blank_mcq'),
    prompt: text('prompt').notNull(),
    correctAnswer: varchar('correct_answer', { length: 100 }).notNull(),
    distractors: jsonb('distractors').$type<string[]>().notNull(),
    // Per-type extra data: sentence_builder uses { tokens: string[] }, picture_tap
    // uses { choices: [{ id, imageUrl, imagePrompt }], correctChoiceId }. Null for
    // fill_blank_mcq and true_false where the existing columns suffice.
    payload: jsonb('payload'),
    imagePrompt: text('image_prompt'),
    imageUrl: text('image_url'),
    gradeLevel: integer('grade_level').default(1),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    active: boolean('active').default(true).notNull(),
    timesServed: integer('times_served').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    unitActiveIdx: index('idx_practice_questions_unit_active').on(table.unit, table.active),
    bookUnitActiveIdx: index('idx_practice_questions_book_unit_active').on(
      table.bookSlug,
      table.unit,
      table.active
    ),
    typeIdx: index('idx_practice_questions_type').on(table.questionType),
  })
);

export const practiceAttempts = pgTable(
  'practice_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => practiceQuestions.id, { onDelete: 'cascade' }),
    selectedAnswer: varchar('selected_answer', { length: 100 }).notNull(),
    isCorrect: boolean('is_correct').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    studentIdIdx: index('idx_practice_attempts_student_id').on(table.studentId),
    questionIdIdx: index('idx_practice_attempts_question_id').on(table.questionId),
    // Used by the Leitner selection query in /api/practice/session — pulls
    // each (student, question)'s recent attempts to derive box + due_at.
    studentQuestionTimeIdx: index('idx_practice_attempts_student_question_time').on(
      table.studentId,
      table.questionId,
      table.answeredAt,
    ),
  })
);

// Per-class allowlist of practice units. A row (class_id, unit) means the
// students in that class can pick that unit in the practice picker. Empty for a
// class = nothing visible to its students. Backfilled with every existing class
// × every available unit so legacy classes don't lose access on first deploy.
export const classPracticeUnits = pgTable(
  'class_practice_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    unit: integer('unit').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueClassUnit: uniqueIndex('unique_class_practice_unit').on(table.classId, table.unit),
    classIdIdx: index('idx_class_practice_units_class_id').on(table.classId),
  })
);

export const classPracticeUnitsRelations = relations(classPracticeUnits, ({ one }) => ({
  class: one(classes, { fields: [classPracticeUnits.classId], references: [classes.id] }),
}));

// ---------- Gamification ----------
//
// Three-table design: append-only event log + materialized rollup + unlock list.
// XP events are the source of truth; the rollup avoids summing the log on every read.

export const studentXpEvents = pgTable(
  'student_xp_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    sourceId: uuid('source_id'),
    points: integer('points').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    studentTimeIdx: index('idx_student_xp_events_student_time').on(table.studentId, table.createdAt),
  })
);

export const studentProgression = pgTable('student_progression', {
  studentId: uuid('student_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalXp: integer('total_xp').default(0).notNull(),
  currentLevel: integer('current_level').default(1).notNull(),
  currentStreakDays: integer('current_streak_days').default(0).notNull(),
  longestStreakDays: integer('longest_streak_days').default(0).notNull(),
  lastActivityDate: date('last_activity_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const studentUnlocks = pgTable(
  'student_unlocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    unlockType: varchar('unlock_type', { length: 20 }).notNull(),
    unlockKey: varchar('unlock_key', { length: 60 }).notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueUnlock: uniqueIndex('unique_student_unlock').on(table.studentId, table.unlockType, table.unlockKey),
    studentIdx: index('idx_student_unlocks_student').on(table.studentId),
  })
);

export const studentXpEventsRelations = relations(studentXpEvents, ({ one }) => ({
  student: one(users, { fields: [studentXpEvents.studentId], references: [users.id] }),
}));

export const studentProgressionRelations = relations(studentProgression, ({ one }) => ({
  student: one(users, { fields: [studentProgression.studentId], references: [users.id] }),
}));

export const studentUnlocksRelations = relations(studentUnlocks, ({ one }) => ({
  student: one(users, { fields: [studentUnlocks.studentId], references: [users.id] }),
}));

export const practiceQuestionsRelations = relations(practiceQuestions, ({ one, many }) => ({
  creator: one(users, { fields: [practiceQuestions.generatedBy], references: [users.id] }),
  attempts: many(practiceAttempts),
}));

export const practiceAttemptsRelations = relations(practiceAttempts, ({ one }) => ({
  student: one(users, { fields: [practiceAttempts.studentId], references: [users.id] }),
  question: one(practiceQuestions, { fields: [practiceAttempts.questionId], references: [practiceQuestions.id] }),
}));

// Simple sessions table for authentication
export const session = pgTable('session', {
  id: varchar('id', { length: 255 }).primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
  lastActivityAt: timestamp('lastActivityAt', { withTimezone: true }).defaultNow(),
  ipAddress: varchar('ipAddress', { length: 255 }),
  userAgent: varchar('userAgent', { length: 500 }),
  userId: uuid('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, { fields: [session.userId], references: [users.id] }),
}));
