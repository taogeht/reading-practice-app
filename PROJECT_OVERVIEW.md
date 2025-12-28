# Recording Homework App - Complete Project Overview

A reading practice platform where students record themselves reading stories aloud. Teachers create assignments, review recordings, and track progress.

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Project Structure](#project-structure)
3. [Database Schema](#database-schema)
4. [Authentication System](#authentication-system)
5. [API Reference](#api-reference)
6. [Component Architecture](#component-architecture)
7. [Audio & Storage Systems](#audio--storage-systems)
8. [User Flows](#user-flows)
9. [Environment Configuration](#environment-configuration)
10. [Development Commands](#development-commands)

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15.5.3 with App Router |
| **Runtime** | React 19, TypeScript |
| **Build Tool** | Turbopack |
| **Database** | PostgreSQL |
| **ORM** | Drizzle ORM |
| **Authentication** | Session-based with bcryptjs |
| **Styling** | Tailwind CSS 4 |
| **UI Components** | shadcn/ui, Radix UI, Lucide icons |
| **Text-to-Speech** | Google Cloud Text-to-Speech |
| **File Storage** | Cloudflare R2 (S3-compatible) |
| **Forms** | React Hook Form + Zod validation |

---

## Project Structure

```
recording-homework-app/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (admin)/            # Admin route group
│   │   ├── (student)/          # Student route group  
│   │   ├── admin/              # Admin pages
│   │   ├── api/                # REST API endpoints
│   │   ├── login/              # Teacher/admin login
│   │   ├── student/            # Student pages
│   │   ├── student-login/      # Visual password login
│   │   ├── teacher/            # Teacher pages
│   │   └── unauthorized/       # Access denied page
│   ├── components/             # Reusable React components
│   │   ├── admin/              # Admin management components
│   │   ├── assignments/        # Assignment-related components
│   │   ├── audio/              # Audio recorder component
│   │   ├── auth/               # Login forms, visual password
│   │   ├── classes/            # Class management
│   │   ├── layouts/            # Page layout wrappers
│   │   ├── providers/          # React context providers
│   │   ├── stories/            # Story library & management
│   │   ├── students/           # Student management
│   │   └── ui/                 # shadcn/ui primitives
│   ├── config/                 # App configuration
│   ├── lib/                    # Core business logic
│   │   ├── auth.ts             # Session authentication
│   │   ├── audit.ts            # Audit logging
│   │   ├── logger.ts           # Error/event logging
│   │   ├── utils.ts            # Utility functions
│   │   ├── db/                 # Database layer
│   │   │   ├── index.ts        # Drizzle client
│   │   │   └── schema.ts       # Table definitions
│   │   ├── storage/            # R2 file storage
│   │   │   ├── client.ts       # S3 client config
│   │   │   └── upload-utils.ts # Upload helpers
│   │   └── tts/                # Text-to-speech
│   │       └── client.ts       # Google TTS client
│   ├── middleware.ts           # Route protection
│   └── types/                  # TypeScript definitions
├── migrations/                 # Drizzle migration files
├── public/                     # Static assets
├── scripts/                    # Utility scripts
└── drizzle.config.ts           # Drizzle configuration
```

---

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o| students : "extends"
    users ||--o| teachers : "extends"
    users ||--o{ schoolMemberships : "belongs to"
    users ||--o{ session : "has"
    users ||--o{ auditLogs : "performs"
    
    schools ||--o{ schoolMemberships : "has"
    schools ||--o{ classes : "contains"
    
    teachers ||--o{ classes : "manages"
    teachers ||--o{ assignments : "creates"
    teachers ||--o{ recordings : "reviews"
    
    students ||--o{ classEnrollments : "enrolled"
    students ||--o{ recordings : "submits"
    students ||--o{ studentProgress : "tracks"
    
    classes ||--o{ classEnrollments : "has"
    classes ||--o{ assignments : "has"
    
    stories ||--o{ assignments : "used in"
    
    assignments ||--o{ recordings : "receives"
    assignments ||--o{ studentProgress : "tracks"
    
    recordings ||--o| studentProgress : "linked"
```

### Core Tables

#### `users`
Central user table for all roles (student, teacher, admin).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Unique, nullable for students |
| `passwordHash` | VARCHAR(255) | bcrypt hash |
| `role` | ENUM | 'student', 'teacher', 'admin' |
| `firstName` | VARCHAR(100) | Required |
| `lastName` | VARCHAR(100) | Required |
| `active` | BOOLEAN | Soft delete flag |

#### `students`
Extends users with student-specific data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | FK → users.id |
| `gradeLevel` | INTEGER | Grade 1-12 |
| `avatarUrl` | VARCHAR(500) | Profile image |
| `visualPasswordType` | ENUM | 'animal' or 'object' |
| `visualPasswordData` | JSONB | Password configuration |
| `readingLevel` | VARCHAR(50) | Current reading level |

#### `teachers`
Extends users with teacher-specific data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | FK → users.id |
| `employeeId` | VARCHAR(100) | School ID |
| `department` | VARCHAR(100) | Department name |
| `subjects` | TEXT[] | Array of subjects |

#### `stories`
Reading content with TTS audio support.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | VARCHAR(255) | Story title |
| `content` | TEXT | Full story text |
| `readingLevel` | VARCHAR(50) | Difficulty level |
| `gradeLevels` | INTEGER[] | Target grades |
| `wordCount` | INTEGER | Calculated |
| `estimatedReadingTimeMinutes` | INTEGER | Calculated |
| `ttsAudio` | JSONB | Generated audio URLs |
| `active` | BOOLEAN | Archive flag |
| `createdBy` | UUID | FK → users.id |

#### `assignments`
Links stories to classes with due dates.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | VARCHAR(255) | Assignment title |
| `storyId` | UUID | FK → stories.id |
| `classId` | UUID | FK → classes.id |
| `teacherId` | UUID | FK → teachers.id |
| `status` | ENUM | 'draft', 'published', 'archived' |
| `dueAt` | TIMESTAMP | Due date |
| `maxAttempts` | INTEGER | Default: 3 |

#### `recordings`
Student audio submissions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `assignmentId` | UUID | FK → assignments.id |
| `studentId` | UUID | FK → students.id |
| `audioUrl` | VARCHAR(500) | R2 file URL |
| `audioDurationSeconds` | INTEGER | Recording length |
| `attemptNumber` | INTEGER | 1-based attempt |
| `status` | ENUM | 'pending', 'submitted', 'reviewed', 'flagged' |
| `wpmScore` | DECIMAL | Words per minute |
| `accuracyScore` | DECIMAL | 0-100 accuracy |
| `teacherFeedback` | TEXT | Review notes |

#### `session`
Active user sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(255) | Session ID (cookie value) |
| `token` | VARCHAR(255) | Unique token |
| `userId` | UUID | FK → users.id |
| `expiresAt` | TIMESTAMP | 7 days from creation |
| `ipAddress` | VARCHAR(255) | Client IP |
| `userAgent` | VARCHAR(500) | Browser info |

### Enums

```sql
user_role: 'student' | 'teacher' | 'admin'
assignment_status: 'draft' | 'published' | 'archived'
recording_status: 'pending' | 'submitted' | 'reviewed' | 'flagged'
visual_password_type: 'animal' | 'object'
```

---

## Authentication System

### Session-Based Auth Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB
    
    Client->>API: POST /api/auth/login
    API->>DB: Find user by email
    DB-->>API: User record
    API->>API: Verify password (bcrypt)
    API->>DB: Create session (7-day expiry)
    API->>Client: Set-Cookie: session-id
    
    Client->>API: GET /api/protected
    API->>API: Read session-id cookie
    API->>DB: Validate session
    DB-->>API: User data
    API-->>Client: Protected data
```

### Key Functions (`src/lib/auth.ts`)

| Function | Description |
|----------|-------------|
| `hashPassword(password)` | bcrypt hash with 12 rounds |
| `verifyPassword(password, hash)` | Compare password to hash |
| `createSession(userId)` | Generate session, store in DB, return ID |
| `deleteSession(sessionId)` | Remove session from DB |
| `cleanupExpiredSessions()` | Remove all expired sessions |
| `authenticateUser(email, password)` | Full login flow |
| `getCurrentUser()` | Get user from session cookie |

### Visual Password (Students)

Students use picture-based passwords instead of text:
- **Types**: Animals or Objects
- **Selection**: 3-4 images in sequence
- **Storage**: JSONB in `students.visualPasswordData`
- **Component**: `src/components/students/visual-password-creator.tsx`

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Teacher/admin email login |
| POST | `/api/auth/student-login` | Student visual password login |
| POST | `/api/auth/logout` | Clear session |

### Stories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stories` | List all stories |
| POST | `/api/stories` | Create story |
| GET | `/api/stories/[id]` | Get story details |
| PUT | `/api/stories/[id]` | Update story |
| DELETE | `/api/stories/[id]` | Delete story |
| POST | `/api/stories/[id]/archive` | Archive story |
| DELETE | `/api/stories/[id]/archive` | Unarchive story |

### Assignments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assignments` | List assignments |
| POST | `/api/assignments` | Create assignment |
| GET | `/api/assignments/[id]` | Get assignment |
| PUT | `/api/assignments/[id]` | Update assignment |
| DELETE | `/api/assignments/[id]` | Delete assignment |

### Recordings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recordings` | List recordings |
| POST | `/api/recordings` | Submit recording |
| GET | `/api/recordings/[id]` | Get recording |
| PUT | `/api/recordings/[id]` | Update recording (review) |

### Classes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List teacher's classes |
| POST | `/api/classes` | Create class |
| GET | `/api/classes/[id]` | Get class details |
| PUT | `/api/classes/[id]` | Update class |
| DELETE | `/api/classes/[id]` | Delete class |

### Text-to-Speech

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tts/voices` | List available voices |
| POST | `/api/tts/generate` | Generate TTS audio |
| POST | `/api/tts/batch` | Batch TTS generation |

### File Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload/presigned-url` | Get R2 upload URL |

---

## Component Architecture

### Core Components

#### `StoryLibrary` (`src/components/stories/story-library.tsx`)
- Filterable grid of story cards
- Search by title, reading level, grade, genre
- Audio availability filtering
- Archive/unarchive support

#### `StoryDetailView` (`src/components/stories/story-detail-view.tsx`)
- Full story display
- TTS audio playback
- Assignment creation
- Edit/delete actions

#### `AudioRecorder` (`src/components/audio/audio-recorder.tsx`)
- WebRTC-based recording
- Real-time duration display
- Playback preview
- Direct R2 upload with progress
- Auto-submit to assignments

```typescript
interface AudioRecorderProps {
  onRecordingComplete?: (result: UploadResult) => void;
  maxDurationSeconds?: number;    // Default: 300 (5 min)
  showLivePreview?: boolean;      // Default: true
  disabled?: boolean;
  assignmentId?: string;
}
```

#### `VisualPasswordCreator` (`src/components/students/visual-password-creator.tsx`)
- Animal/object image selection
- Sequence-based password
- Child-friendly large buttons

### UI Primitives (`src/components/ui/`)

Built on shadcn/ui and Radix:
- `Button`, `Card`, `Dialog`, `Input`, `Label`
- `Select`, `Tabs`, `Textarea`, `Toast`
- `Progress`, `Slider`, `Switch`
- `DropdownMenu`, `AlertDialog`

---

## Audio & Storage Systems

### Google Cloud Text-to-Speech

**Client**: `src/lib/tts/client.ts`

Available voices:
| Voice ID | Name | Language | Gender |
|----------|------|----------|--------|
| `en-US-Neural2-F` | US Female | en-US | Female |
| `en-US-Neural2-D` | US Male | en-US | Male |
| `en-GB-Neural2-A` | UK Narrator | en-GB | Female |

**Usage**:
```typescript
import { googleTtsClient } from '@/lib/tts/client';

// Single generation
const result = await googleTtsClient.generateSpeech({
  text: 'Hello world',
  voice_id: 'en-US-Neural2-F',
  speakingRate: 1.0,
});

// Batch generation
const results = await googleTtsClient.generateBatchSpeech(
  [{ id: '1', text: 'Story 1' }, { id: '2', text: 'Story 2' }],
  (completed, total) => console.log(`${completed}/${total}`)
);
```

### Cloudflare R2 Storage

**Client**: `src/lib/storage/client.ts`

File organization:
```
bucket/
├── tts/           # Generated TTS audio files
│   └── {story-id}/{timestamp}.mp3
└── recordings/    # Student recordings
    └── {assignment-id}/{student-id}/{attempt}.webm
```

**Upload Flow** (`src/lib/storage/upload-utils.ts`):
1. Request presigned URL from `/api/upload/presigned-url`
2. Upload file via XHR with progress tracking
3. Return public URL for storage in DB

```typescript
import { uploadAudioFile } from '@/lib/storage/upload-utils';

const result = await uploadAudioFile(
  audioFile,
  'recording',
  (progress) => console.log(`${progress.percentage}%`)
);
```

---

## User Flows

### Student Flow

```mermaid
flowchart LR
    A[Select Avatar] --> B[Enter Visual Password]
    B --> C[Dashboard]
    C --> D{View Assignments}
    D --> E[Listen to Story TTS]
    E --> F[Practice Reading]
    F --> G[Record Reading]
    G --> H[Submit Recording]
    H --> C
```

**Pages**:
- `/student-login` - Visual password entry
- `/student/dashboard` - Assignment overview
- `/student/assignments/[id]` - Practice view
- `/student/practice/[id]` - Recording interface

### Teacher Flow

```mermaid
flowchart LR
    A[Email Login] --> B[Dashboard]
    B --> C{Actions}
    C --> D[Manage Stories]
    C --> E[Manage Classes]
    C --> F[Create Assignments]
    C --> G[Review Submissions]
    D --> H[Generate TTS]
    G --> I[Provide Feedback]
```

**Pages**:
- `/login` - Email/password login
- `/teacher/dashboard` - Class overview, recent submissions
- `/teacher/stories` - Story library
- `/teacher/classes` - Class management
- `/teacher/assignments` - Assignment management
- `/teacher/submissions` - Recording review

### Admin Flow

**Pages**:
- `/admin/users` - User management
- `/admin/schools` - School management
- `/admin/settings` - System settings
- `/admin/audit` - Audit log viewer

---

## Environment Configuration

Required variables in `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Cloudflare R2
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="your-bucket-name"
R2_PUBLIC_URL="https://your-bucket.r2.cloudflarestorage.com"

# Google Cloud TTS
GOOGLE_TTS_PROJECT_ID="your-project-id"
GOOGLE_TTS_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com"
GOOGLE_TTS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BETTER_AUTH_SECRET="random-secret-for-sessions"
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:push` | Push schema to DB |
| `npm run db:migrate` | Run migrations |
| `npm run db:generate` | Generate migration files |
| `npm run db:seed` | Seed sample data |

---

## Key Design Decisions

1. **Session-based auth over JWT**: Simpler revocation, server-side control
2. **Visual passwords for students**: Age-appropriate, no typing required
3. **One-time TTS generation**: Cost optimization (generate once, store forever)
4. **Cloudflare R2 over S3**: Zero egress fees
5. **Drizzle ORM**: Type-safe queries, lightweight, great DX
6. **Turbopack**: Fast builds during development

---

## Next Steps (Phase 2)

- [ ] Analytics dashboard with WPM/accuracy charts
- [ ] Automated flagging for struggling students
- [ ] Performance trend visualizations
- [ ] Bulk student import/export
- [ ] LMS integrations (Canvas, Google Classroom)
