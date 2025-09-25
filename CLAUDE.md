# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a reading practice homework application where students record themselves reading stories aloud. Teachers can create stories with TTS audio, assign them to students, and review recorded submissions.

## Development Commands

- `npm run dev` - Start development server with Turbopack (http://localhost:3000)
- `npm run build` - Build for production with Turbopack
- `npm run lint` - Run ESLint (warnings disabled for deployment)
- `npm run db:studio` - Open Drizzle Studio for database management
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:generate` - Generate migration files
- `npm run db:seed` - Seed database with sample data

## Technology Stack

- **Frontend**: Next.js 15.5.3 with App Router, React 19, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Custom session-based auth with bcryptjs
- **UI**: Tailwind CSS 4, shadcn/ui components, Lucide icons
- **Storage**: Cloudflare R2 for audio files
- **TTS**: ElevenLabs API for generating story audio
- **Forms**: React Hook Form with Zod validation

## Architecture

### User Roles & Authentication
- **Students**: Record themselves reading stories (password-less login via visual passwords)
- **Teachers**: Create stories, manage classes, review recordings
- **Admin**: Manage schools, users, and system settings

Authentication uses session cookies managed by `src/lib/auth.ts`. Visual passwords for students use animal or object selections in `src/components/students/visual-password-creator.tsx`.

### Database Schema (src/lib/db/schema.ts)
Core entities:
- `users` - Students, teachers, admins with role-based access
- `schools` - Educational institutions
- `classes` - Teacher-managed student groups
- `stories` - Reading content with TTS audio and archive support
- `assignments` - Stories assigned to classes with due dates
- `recordings` - Student audio submissions with metadata
- `session` - Authentication session management

### App Router Structure
- `/admin/*` - School/user management (admins only)
- `/teacher/*` - Story creation, class management, review recordings
- `/student/*` - Practice reading, submit recordings
- `/api/*` - REST endpoints for all functionality
- Route groups: `(admin)`, `(student)` for role-based layouts

### Story Management
Stories support:
- Archive/unarchive functionality (active field controls visibility)
- TTS audio generation via ElevenLabs
- Reading levels and grade targeting
- Rich text content with metadata (word count, reading time)

Archive system: Stories have an `active` boolean field. Archived stories (active=false) are hidden from students but visible to teachers in a dedicated dashboard section.

### Audio Processing
- Student recordings uploaded to Cloudflare R2
- TTS audio generated for stories via ElevenLabs API
- Audio playback components with controls
- Presigned URLs for secure file access

### Key Components
- `StoryLibrary` - Filterable story grid with archive support
- `StoryDetailView` - Story management with TTS generation
- `AudioRecorder` - WebRTC recording with upload
- `VisualPasswordInput` - Student authentication UI
- `CreateAssignmentDialog` - Teacher assignment creation

## Environment Variables

Required in `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string
- `R2_*` - Cloudflare R2 storage credentials
- `ELEVEN_LABS_API_KEY` - TTS service API key
- `BETTER_AUTH_SECRET` - Session encryption key

## API Patterns

- Role-based authorization via `getCurrentUser()` in routes
- RESTful endpoints under `/api/` with HTTP method routing
- Consistent error handling and JSON responses
- Archive endpoints: `POST /api/stories/[id]/archive` and `DELETE /api/stories/[id]/archive`

## Database Operations

- Use Drizzle ORM with typed queries
- `npm run db:studio` to inspect data via web UI
- Migration workflow: modify schema → `db:generate` → `db:push/migrate`
- Seed data available via `npm run db:seed`

## Build Configuration

- ESLint warnings disabled for deployment (see `eslint.config.mjs`)
- TypeScript errors ignored during build (see `next.config.ts`)
- Turbopack enabled for faster builds and development
