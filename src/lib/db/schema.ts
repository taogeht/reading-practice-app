import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  smallint,
  pgEnum,
  jsonb,
  decimal,
  bigint,
  inet,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['student', 'teacher', 'admin']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['draft', 'published', 'archived']);
export const recordingStatusEnum = pgEnum('recording_status', ['pending', 'submitted', 'reviewed', 'flagged']);
export const visualPasswordTypeEnum = pgEnum('visual_password_type', ['animal', 'object']);
export const mediaTypeEnum = pgEnum('media_type', ['video', 'photo', 'audio']);

// Reading-feature enums (Raz-Kids-style reading practice).
// `partOfSpeech` covers the major English POS the validator/generator needs.
// `afFLevel` mirrors the school's American Family & Friends curriculum
// progression (Starter → Grade 6). `cefrLevel` is the standard CEFR scale
// used as a generation guard rail for non-target vocabulary.
export const partOfSpeechEnum = pgEnum('part_of_speech', [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'interjection',
  'determiner',
  'other',
]);
export const afFLevelEnum = pgEnum('af_f_level', [
  'starter',
  'grade1',
  'grade2',
  'grade3',
  'grade4',
  'grade5',
  'grade6',
]);
export const cefrLevelEnum = pgEnum('cefr_level', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

// Reading-passage lifecycle. `draft` = pipeline output not yet reviewed;
// `review` = waiting on a teacher to approve; `published` = visible to
// students; `archived` = hidden but kept for analytics.
export const passageStatusEnum = pgEnum('passage_status', [
  'draft',
  'review',
  'published',
  'archived',
]);

// Reading comprehension question types. `mcq_comprehension` = single best
// answer with an evidence quote. `vocab_matching` = drag word→meaning.
// `sequence_order` = arrange story events in order.
export const readingQuestionTypeEnum = pgEnum('reading_question_type', [
  'mcq_comprehension',
  'vocab_matching',
  'sequence_order',
]);

// Reading session state. `in_progress` = student is mid-read; `completed`
// = all pages + all questions done; `abandoned` = left mid-read (heartbeat
// gone or explicitly closed).
export const readingSessionStatusEnum = pgEnum('reading_session_status', [
  'in_progress',
  'completed',
  'abandoned',
]);

// Lifecycle of a teacher-initiated batch passage generation. `queued`
// is the brief window between the row being inserted and the
// background loop picking it up; `running` covers actual generation;
// `completed` means at least one passage in the batch succeeded;
// `failed` means every passage in the batch failed.
export const readingGenerationJobStatusEnum = pgEnum(
  'reading_generation_job_status',
  ['queued', 'running', 'completed', 'failed'],
);

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
  // Memorable URL identifier for student logins. Auto-suggested from name +
  // academicYear at create time, teacher-editable, globally unique. Resolves
  // via /c/<slug>. Nullable so existing rows aren't blocked before backfill;
  // new rows always get a value.
  slug: varchar('slug', { length: 60 }).unique(),
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
  // When false, students enrolled in this class won't see the "This week"
  // recap tab/content for it. Default true to keep existing classes working
  // as-is until the teacher opts out.
  weeklyRecapEnabled: boolean('weekly_recap_enabled').default(true).notNull(),
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

// Co-teachers attached to a class. The "primary" teacher stays in
// classes.teacher_id (unchanged) — this table holds *additional* teachers who
// share full control of the class. Membership is checked across both
// classes.teacher_id and this table by lib/auth/class-access.
export const classTeachers = pgTable(
  'class_teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    classIdIdx: index('idx_class_teachers_class_id').on(table.classId),
    teacherIdIdx: index('idx_class_teachers_teacher_id').on(table.teacherId),
    uniqueClassTeacher: uniqueIndex('unique_class_teacher').on(table.classId, table.teacherId),
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
    // Optional voice reply from the teacher. When populated, the student's
    // feedback callout renders an audio player alongside the text feedback.
    // Re-recording overwrites: the prior R2 key is deleted, this column is
    // updated. Null when the teacher hasn't recorded a reply.
    teacherReplyAudioUrl: varchar('teacher_reply_audio_url', { length: 500 }),
    teacherReplyDurationSeconds: integer('teacher_reply_duration_seconds'),
    teacherReplyUploadedAt: timestamp('teacher_reply_uploaded_at', { withTimezone: true }),
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

// Weekly Recap - one row per class per week. Class-level content (pages,
// vocab, tests, homework) shared by every student in the class. Per-student
// behavior + parent confirmation lives in studentWeeklyRecapEntries.
export const classWeeklyRecaps = pgTable(
  'class_weekly_recaps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    pagesCovered: text('pages_covered'),
    vocabulary: text('vocabulary'),
    spellingTestInfo: text('spelling_test_info'),
    grammarTestInfo: text('grammar_test_info'),
    homework: text('homework'),
    // 'checklist' = each student gets the 6 behavior ratings.
    // 'comment' = each student gets a free-text teacher note.
    behaviorFormat: varchar('behavior_format', { length: 20 }).notNull().default('checklist'),
    // 'draft' is teacher-only; 'published' is visible to students.
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    classIdIdx: index('idx_class_weekly_recaps_class_id').on(table.classId),
    uniqueClassWeek: uniqueIndex('unique_class_weekly_recap').on(table.classId, table.weekNumber),
    statusIdx: index('idx_class_weekly_recaps_status').on(table.status),
  })
);

// Per-student row attached to a recap. Auto-created for every enrolled student
// when the teacher opens or publishes the recap. Holds personalized behavior
// data (whichever shape matches the parent recap's behaviorFormat) and the
// parent's "I've reviewed this" timestamp.
export const studentWeeklyRecapEntries = pgTable(
  'student_weekly_recap_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recapId: uuid('recap_id').notNull().references(() => classWeeklyRecaps.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    // Used when the parent recap is in 'checklist' mode. Shape:
    //   { listening: 'excellent' | 'good' | 'needs_work', ... 6 keys ... }
    behaviorRatings: jsonb('behavior_ratings'),
    // Used when the parent recap is in 'comment' mode.
    teacherComment: text('teacher_comment'),
    parentConfirmedAt: timestamp('parent_confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recapIdIdx: index('idx_student_weekly_recap_entries_recap_id').on(table.recapId),
    studentIdIdx: index('idx_student_weekly_recap_entries_student_id').on(table.studentId),
    uniqueRecapStudent: uniqueIndex('unique_recap_student').on(table.recapId, table.studentId),
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

// ----- Reading practice (Raz-Kids-style) -----
// Vocabulary master table — the spine for the reading-passage feature.
// Every word the generator and validator know about lives here, tagged with
// AF&F level/unit, CEFR, part of speech, and any phonics pattern it
// introduces. `word` is unique case-insensitively; the application layer
// is responsible for lower-casing on insert (no citext extension installed).
export const vocabulary = pgTable(
  'vocabulary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    word: text('word').notNull().unique(),
    partOfSpeech: partOfSpeechEnum('part_of_speech').notNull(),
    // Nullable when the curriculum mapping isn't known yet — keeps importing
    // partial datasets cheap.
    afFLevel: afFLevelEnum('af_f_level'),
    afFUnit: smallint('af_f_unit'),
    cefrLevel: cefrLevelEnum('cefr_level'),
    exampleSentence: text('example_sentence'),
    mandarinTranslation: text('mandarin_translation'),
    // Free-text tag like "th-digraph" or "long-a-CVCe". Story generation can
    // hint the phonics focus to weave these in.
    introducesPhonicsPattern: text('introduces_phonics_pattern'),
    // Function words (articles, auxiliaries, basic pronouns/preps) are
    // exempt from the per-story frequency-cap rules — without this flag the
    // validator would punish stories that naturally repeat "the" or "is".
    isFunctionWord: boolean('is_function_word').default(false).notNull(),
    // Open-class words the AF&F curriculum doesn't formally introduce but
    // implicitly assumes (basic action verbs like "see"/"want"/"sit",
    // common adjectives like "happy"/"nice", locative prepositions like
    // "behind"/"near"). Seeded separately via scripts/seed-scaffold-vocabulary.
    // Mutually exclusive with both is_function_word and curriculum tagging
    // (af_f_level set) — the seed scripts enforce that invariant.
    isScaffold: boolean('is_scaffold').default(false).notNull(),
    // Curriculum-tagged words that are universally available regardless of
    // the (af_f_level, af_f_unit) cap. Promoted via
    // scripts/promote-core-vocabulary for a curated set of K/G1 verbs the
    // textbook formally introduces in late units (look, run, go, give,
    // draw, etc.) but every kid knows at any unit. Independent of
    // is_function_word and is_scaffold; can co-exist with af_f_level.
    isCoreVocabulary: boolean('is_core_vocabulary').default(false).notNull(),
    // Whether the word has a clear, unambiguous picture-card referent.
    // Read by the vocab_matching target-selection filter: numbers, abstract
    // evaluatives ("good"/"bad"), and discourse markers ("here"/"too") all
    // produce confusing or ambiguous Gemini illustrations and are flagged
    // false. Default true keeps existing rows opt-in only for the curated
    // exclusion list (scripts/mark-unpicturable-vocab.ts). Independent of
    // function/scaffold/core flags — a curriculum noun like "elephant" is
    // picturable; a function word like "the" is not.
    isPicturable: boolean('is_picturable').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    afFLevelUnitIdx: index('idx_vocabulary_aff_level_unit').on(table.afFLevel, table.afFUnit),
    cefrIdx: index('idx_vocabulary_cefr').on(table.cefrLevel),
  }),
);

// ----- Reading passages, pages, questions, and student interaction -----
// Six tables that together model the Raz-Kids-style reading library:
//   reading_passages      → story header (title, level, status, gen meta)
//   story_pages           → per-page text + image + tts audio
//   reading_questions     → comprehension/vocab/sequence questions per passage
//   student_reading_sessions   → session header (one per (student, attempt))
//   student_reading_answers    → per-question detail rows
//   student_vocabulary_mastery → rolled-up per-(student, word) score
//
// V1 has NO class-assignment binding — passages live in a shared library
// filtered by reading level. Class binding will be a separate task.

// Payload shapes for reading_questions.payload (jsonb). Each question
// type has its own shape; the discriminated union ReadingQuestionPayload
// pairs each shape with its question_type discriminator so callers can
// narrow on a fetched row.

export interface McqComprehensionPayload {
  /** Exactly four answer options. */
  options: string[];
  /** Index into options[] of the correct answer (0–3). */
  correctIndex: number;
}

/** Legacy (V1) vocab_matching payload — word→text-meaning. Kept as a
 *  type for the validator's structural detection of pre-V2 questions
 *  in the DB; the validator emits `legacy_vocab_matching_format` when
 *  it sees one of these. New code should never write this shape. */
export interface VocabMatchingPayloadV1 {
  pairs: Array<{ word: string; meaning: string; vocabId: string }>;
}

/** V2 vocab_matching payload — word→picture. Each pair carries the R2
 *  key (under story-images/{passageId}/vocab-{vocabId}.png) for an image
 *  the student tap-matches to the word. `version: 2` is the explicit
 *  discriminator: legacy V1 rows lack the field and are rejected by
 *  the validator. */
export interface VocabMatchingPayloadV2 {
  version: 2;
  pairs: Array<{ word: string; vocabId: string; imageKey: string }>;
}

/** The current (V2) vocab_matching payload. The exported type
 *  references V2 directly so all new generation/persistence paths
 *  produce V2; the legacy V1 type stays defined above for detection. */
export type VocabMatchingPayload = VocabMatchingPayloadV2;

export interface SequenceOrderPayload {
  /** Story events in correct order; the UI shuffles for display. */
  events: string[];
}

/** The raw jsonb shape sitting in reading_questions.payload — one of three. */
export type ReadingQuestionPayloadJson =
  | McqComprehensionPayload
  | VocabMatchingPayload
  | SequenceOrderPayload;

/** Discriminated union for narrowing a fetched (questionType, payload) pair. */
export type ReadingQuestionPayload =
  | { questionType: 'mcq_comprehension'; payload: McqComprehensionPayload }
  | { questionType: 'vocab_matching'; payload: VocabMatchingPayload }
  | { questionType: 'sequence_order'; payload: SequenceOrderPayload };

/** Generation provenance attached to each reading_passages row.
 *  Filled progressively as the pipeline stages complete; every field is
 *  optional so an in-flight passage row stays valid. The jsonb column
 *  is permissive — these fields are the typed surface the orchestrator
 *  populates; future work can extend without a migration. */
export interface PassageGenerationMeta {
  /** Concise label of the underlying models, e.g.
   *  "claude-sonnet-4-6 + gemini-2.5-flash-image". */
  model?: string;
  promptVersion?: string;
  generatedAt?: string;
  generationDurationMs?: number;
  costUsd?: number;
  /** When this passage is a regeneration of another, the parent's id. */
  parentPassageId?: string;
  /** Number of prose-generation attempts (1 = clean first pass; up to
   *  the regen wrapper's maxAttempts). */
  proseAttemptCount?: number;
  /** Number of Gemini image-generation calls (≈ pages.length). */
  imageCallCount?: number;
  /** Aggregate Claude tokens across plan + prose (incl. regen attempts) +
   *  questions. Image generation is tracked as a separate call count. */
  totalInputTokens?: number;
  totalOutputTokens?: number;
  /** Per-stage quality + the orchestrator's final passageReady verdict. */
  qualityReport?: {
    proseScore: number;
    questionsScore: number;
    imagesValid: boolean;
    passageReady: boolean;
  };
  /** Frozen copy of the Stage 1 plan. Required for per-page and per-
   *  question regeneration — those endpoints need character descriptions,
   *  scene descriptions, and beats from the original plan. Stored as
   *  unstructured jsonb here (TS shape lives in
   *  src/lib/reading/generate/types.ts as PassagePlan); the DB doesn't
   *  enforce the inner shape. Existing rows from before this field
   *  was added will simply have plan undefined; the regen endpoints
   *  return 400 in that case. */
  plan?: unknown;
}

export const readingPassages = pgTable(
  'reading_passages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    // Reading level id (1..5) from src/lib/reading/levels.ts. Levels live
    // in code, not a DB table — the app validates the value on insert.
    readingLevel: smallint('reading_level').notNull(),
    // Vocabulary.id UUIDs the passage targets. Multi-word vocab entries
    // (e.g. "teddy bear") are referenced identically to single-word ones;
    // the future tokeniser will need longest-first matching when scanning
    // story text against the cumulative vocab set.
    targetVocabIds: jsonb('target_vocab_ids')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Denormalised count of story_pages rows for cheap library listing —
    // app layer keeps it in sync on insert/update of pages.
    pageCount: smallint('page_count').notNull(),
    status: passageStatusEnum('status').default('draft').notNull(),
    generationMeta: jsonb('generation_meta')
      .$type<PassageGenerationMeta>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    summary: text('summary'),
    coverImageKey: text('cover_image_key'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    statusLevelIdx: index('idx_reading_passages_status_level').on(
      table.status,
      table.readingLevel,
    ),
    statusActiveIdx: index('idx_reading_passages_status_active').on(
      table.status,
      table.isActive,
    ),
  }),
);

export type ReadingPassage = typeof readingPassages.$inferSelect;
export type NewReadingPassage = typeof readingPassages.$inferInsert;

export const storyPages = pgTable(
  'story_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passageId: uuid('passage_id')
      .notNull()
      .references(() => readingPassages.id, { onDelete: 'cascade' }),
    pageNumber: smallint('page_number').notNull(),
    text: text('text').notNull(),
    imageKey: text('image_key'),
    imagePromptUsed: text('image_prompt_used'),
    ttsAudioKey: text('tts_audio_key'),
    ttsVoice: text('tts_voice'),
    /** Set when the page text was last manually edited from the review
     *  queue (PATCH /api/teacher/reading/passages/.../pages/...). NULL
     *  means the text is still as the model generated it. The pair
     *  (editedAt, editedBy) is the single most-recent edit only — no
     *  history. The review UI surfaces this as a "Edited by … on …"
     *  line so reviewers know the prose is no longer purely model
     *  output. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique on (passage, page) doubles as the lookup index for
    // "list pages of passage X" — no separate passage_id index needed.
    uniquePassagePage: uniqueIndex('unique_story_page').on(
      table.passageId,
      table.pageNumber,
    ),
  }),
);

export type StoryPage = typeof storyPages.$inferSelect;
export type NewStoryPage = typeof storyPages.$inferInsert;

export const readingQuestions = pgTable(
  'reading_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passageId: uuid('passage_id')
      .notNull()
      .references(() => readingPassages.id, { onDelete: 'cascade' }),
    questionType: readingQuestionTypeEnum('question_type').notNull(),
    questionText: text('question_text').notNull(),
    orderIndex: smallint('order_index').notNull(),
    payload: jsonb('payload').$type<ReadingQuestionPayloadJson>().notNull(),
    vocabWordId: uuid('vocab_word_id').references(() => vocabulary.id),
    // For mcq_comprehension only: a substring of one of the passage's
    // pages that supports the correct answer. The validator enforces the
    // substring invariant; the UI can highlight the quote on review.
    evidenceQuote: text('evidence_quote'),
    evidencePageNumber: smallint('evidence_page_number'),
    // 1–5 difficulty calibrated from empirical accuracy data. Null until
    // we have enough attempts to compute it.
    difficulty: smallint('difficulty'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    passageIdIdx: index('idx_reading_questions_passage_id').on(table.passageId),
  }),
);

export type ReadingQuestion = typeof readingQuestions.$inferSelect;
export type NewReadingQuestion = typeof readingQuestions.$inferInsert;

export const studentReadingSessions = pgTable(
  'student_reading_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    passageId: uuid('passage_id')
      .notNull()
      .references(() => readingPassages.id),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pagesViewed: smallint('pages_viewed').default(0).notNull(),
    questionsAnswered: smallint('questions_answered').default(0).notNull(),
    questionsCorrect: smallint('questions_correct').default(0).notNull(),
    completionStatus: readingSessionStatusEnum('completion_status')
      .default('in_progress')
      .notNull(),
    timeSecondsTotal: integer('time_seconds_total'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Plain ASC btree — Postgres scans backwards efficiently for the
    // `ORDER BY started_at DESC` query.
    studentPassageStartIdx: index('idx_student_reading_sessions_recent').on(
      table.studentId,
      table.passageId,
      table.startedAt,
    ),
    studentStatusIdx: index('idx_student_reading_sessions_status').on(
      table.studentId,
      table.completionStatus,
    ),
    // At most ONE in_progress session per (student, passage). A
    // partial unique index — completed/abandoned rows are exempt so
    // historical sessions can co-exist. Powers the atomic
    // INSERT … ON CONFLICT DO NOTHING in the start endpoint, which
    // closes a check-then-insert race that previously let StrictMode
    // double-mount or rapid clicks create duplicates.
    oneInProgressPerStudentPassage: uniqueIndex(
      'idx_one_in_progress_per_student_passage',
    )
      .on(table.studentId, table.passageId)
      .where(sql`${table.completionStatus} = 'in_progress'`),
  }),
);

export type StudentReadingSession = typeof studentReadingSessions.$inferSelect;
export type NewStudentReadingSession = typeof studentReadingSessions.$inferInsert;

export const studentReadingAnswers = pgTable(
  'student_reading_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => studentReadingSessions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => readingQuestions.id),
    // Type-specific shape per the matching question's questionType:
    //   mcq_comprehension → number (chosen options[] index)
    //   vocab_matching    → Record<vocabId, chosenMeaning>
    //   sequence_order    → string[] (events in user's order)
    // Schema is intentionally permissive; the API validates against the
    // question's declared type.
    answerGiven: jsonb('answer_given').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    timeSeconds: integer('time_seconds').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Unique on (session, question) doubles as the lookup index for
    // "answers in session X" — no separate session_id index needed.
    uniqueSessionQuestion: uniqueIndex('unique_session_question').on(
      table.sessionId,
      table.questionId,
    ),
    questionIdIdx: index('idx_student_reading_answers_question_id').on(table.questionId),
  }),
);

export type StudentReadingAnswer = typeof studentReadingAnswers.$inferSelect;
export type NewStudentReadingAnswer = typeof studentReadingAnswers.$inferInsert;

// Per-(student, vocabulary) mastery rollup. Mirrors how studentProgression
// rolls up studentXpEvents — the source events for this rollup live in
// studentReadingAnswers (via questions tagged with vocabWordId) and in
// passage exposure (story_pages text scanned for vocab matches at session
// completion). The recompute job is a later task. Composite PK rather than
// a synthetic id since (student_id, vocabulary_id) is naturally unique.
export const studentVocabularyMastery = pgTable(
  'student_vocabulary_mastery',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    vocabularyId: uuid('vocabulary_id')
      .notNull()
      .references(() => vocabulary.id, { onDelete: 'cascade' }),
    exposures: integer('exposures').default(0).notNull(),
    successes: integer('successes').default(0).notNull(),
    failures: integer('failures').default(0).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    // Decay-weighted, 0.000–1.000. Stored as numeric(4,3) so we can
    // express e.g. 0.875 without float drift; Drizzle returns it as a
    // string at the JS boundary.
    masteryScore: decimal('mastery_score', { precision: 4, scale: 3 })
      .default('0')
      .notNull(),
    masteryUpdatedAt: timestamp('mastery_updated_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.studentId, table.vocabularyId] }),
  }),
);

export type StudentVocabularyMastery = typeof studentVocabularyMastery.$inferSelect;
export type NewStudentVocabularyMastery = typeof studentVocabularyMastery.$inferInsert;

// Record of every teacher-initiated batch generation run. Powers the
// "Recent jobs" panel + the per-job detail/retry flow on
// /teacher/reading/generate. The row lives the whole lifecycle of the
// queueMicrotask background loop — inserted up front so the response
// can return an id that survives a serverless instance dying, and
// updated as each passage in the batch finishes.
//
// `passages_results` is an append-only jsonb array of per-passage
// outcomes (passageId + status + qualityReport + optional failure
// info). Stored as raw jsonb rather than its own table because a
// generation never produces more than ~5 passages and queries always
// fetch the full job row anyway.
//
// `parent_job_id` is set when this row was created via the retry
// endpoint — points back at the job whose settings we cloned. Used
// for the "this is a retry of …" link on the detail page.
export const readingGenerationJobs = pgTable(
  'reading_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentJobId: uuid('parent_job_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    readingLevelId: smallint('reading_level_id').notNull(),
    countRequested: smallint('count_requested').notNull(),
    /** Full GenerateOverrides object the teacher submitted. Used by
     *  the retry path to re-fire with identical settings. */
    overridesUsed: jsonb('overrides_used').notNull().default({}),
    /** Union of vocabulary.id UUIDs used across the batch. For
     *  specific-mode jobs, this equals the teacher's pick. For
     *  random-mode jobs, it's whatever the picker chose — preserved
     *  for visibility, not retry. */
    targetVocabIds: jsonb('target_vocab_ids').notNull().default([]),
    status: readingGenerationJobStatusEnum('status').notNull().default('queued'),
    passagesSucceeded: smallint('passages_succeeded').notNull().default(0),
    passagesFailed: smallint('passages_failed').notNull().default(0),
    /** Append-only array of per-passage results; shape lives in
     *  TS-only (StoredPassageResult) so the column stays permissive. */
    passagesResults: jsonb('passages_results').notNull().default([]),
  },
  (table) => ({
    // Powers the recent-jobs list — most-recent first, scoped to a
    // teacher. Postgres uses a forward scan + LIMIT for DESC reads
    // off this index.
    teacherRecentIdx: index('idx_reading_generation_jobs_teacher_recent').on(
      table.teacherId,
      table.createdAt,
    ),
  }),
);

export type ReadingGenerationJob = typeof readingGenerationJobs.$inferSelect;
export type NewReadingGenerationJob = typeof readingGenerationJobs.$inferInsert;

// Per-page audio recordings against a published reading_passage. Mirrors
// the AI-graded columns from `recordings` but is keyed on (page, student,
// attempt) instead of (assignment, student, attempt). Separate table on
// purpose — the original recordings table is tightly bound to assignments
// and to studentProgress rollups, and mixing in nullable passageId/pageId
// would make every aggregation branchy.
//
// Grading columns are nullable on insert; the analyzer populates them
// asynchronously after Whisper returns.
export const passagePageRecordings = pgTable(
  'passage_page_recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passageId: uuid('passage_id')
      .notNull()
      .references(() => readingPassages.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => storyPages.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    attemptNumber: smallint('attempt_number').notNull(),
    audioUrl: varchar('audio_url', { length: 500 }).notNull(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    audioDurationSeconds: decimal('audio_duration_seconds', { precision: 5, scale: 2 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    // Populated async by the analyzer after Whisper transcription.
    transcript: text('transcript'),
    letterGrade: varchar('letter_grade', { length: 2 }),
    accuracyScore: decimal('accuracy_score', { precision: 5, scale: 2 }),
    wpmScore: decimal('wpm_score', { precision: 5, scale: 2 }),
    analysisJson: jsonb('analysis_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // One row per (page, student, attempt). Doubles as the lookup
    // index for "next attempt number".
    uniqueAttempt: uniqueIndex('idx_passage_page_recordings_unique_attempt').on(
      table.pageId,
      table.studentId,
      table.attemptNumber,
    ),
    // Recent-first reads for the student dashboard + teacher per-student
    // section.
    studentRecentIdx: index('idx_passage_page_recordings_student_recent').on(
      table.studentId,
      table.submittedAt,
    ),
    // Per-passage rollup ("how many pages has this student recorded").
    passageStudentIdx: index('idx_passage_page_recordings_passage_student').on(
      table.passageId,
      table.studentId,
    ),
  }),
);

export type PassagePageRecording = typeof passagePageRecordings.$inferSelect;
export type NewPassagePageRecording = typeof passagePageRecordings.$inferInsert;

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
