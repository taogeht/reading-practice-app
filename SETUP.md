# Enhanced Reading Practice Platform - Setup Guide

## Overview
This guide will help you set up the Enhanced Reading Practice Platform with all required services and configurations.

## Prerequisites
- Node.js 20.17.0 or higher
- PostgreSQL database
- Cloudflare account with R2 storage
- ElevenLabs account with API access

## Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/recording_homework_app"

# Authentication (BetterAuth)
BETTER_AUTH_SECRET="your-super-secret-key-here-min-32-characters"
BETTER_AUTH_URL="http://localhost:3000"

# Cloudflare R2 Storage
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="reading-practice-audio"
R2_PUBLIC_URL="https://your-custom-domain.com" # Optional: Custom domain for R2

# ElevenLabs TTS
ELEVEN_LABS_API_KEY="your-eleven-labs-api-key"
ELEVEN_LABS_VOICE_ID="pNInz6obpgDQGcFmaJgB" # Optional: Default voice ID

# Next.js
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## Service Setup Instructions

### 1. PostgreSQL Database Setup

#### Option A: Local PostgreSQL
```bash
# Install PostgreSQL (macOS)
brew install postgresql
brew services start postgresql

# Create database
createdb recording_homework_app

# Create user (optional)
psql -d recording_homework_app
CREATE USER reading_app WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE recording_homework_app TO reading_app;
```

#### Option B: Railway (Recommended for production)
1. Go to [Railway](https://railway.app)
2. Create new project
3. Add PostgreSQL service
4. Copy the DATABASE_URL from the service variables

### 2. Cloudflare R2 Setup

#### Step 1: Create R2 Bucket
1. Log into [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to R2 Object Storage
3. Create bucket named `reading-practice-audio` (or your preferred name)
4. Configure bucket settings:
   - **Public Access**: Enabled (for serving audio files)
   - **Location**: Auto (or closest to your users)

#### Step 2: Create API Token
1. In Cloudflare Dashboard, go to "My Profile" → "API Tokens"
2. Click "Create Token"
3. Use "Custom token" template
4. Configure permissions:
   - **Account**: `Cloudflare R2:Edit`
   - **Zone Resources**: Include All zones from account
5. Copy the generated token as `R2_ACCESS_KEY_ID`

#### Step 3: Get Account ID
1. In Cloudflare Dashboard, find your Account ID in the right sidebar
2. Copy this as `R2_ACCOUNT_ID`

#### Step 4: Create R2 Secret Key
1. Go to R2 Object Storage → Manage R2 API Tokens
2. Create new API token
3. Copy the Secret Access Key as `R2_SECRET_ACCESS_KEY`

#### Step 5: Optional - Custom Domain
1. In your R2 bucket settings, go to "Settings" → "Public Access"
2. Add custom domain (requires domain on Cloudflare)
3. Use this domain as `R2_PUBLIC_URL`

### 3. ElevenLabs Setup

#### Step 1: Create Account
1. Sign up at [ElevenLabs](https://elevenlabs.io)
2. Choose appropriate plan (Starter plan includes 10,000 characters/month)

#### Step 2: Get API Key
1. Go to Profile Settings → API Keys
2. Create new API key
3. Copy as `ELEVEN_LABS_API_KEY`

#### Step 3: Choose Voice (Optional)
1. Go to VoiceLab → Voices
2. Find voice ID for your preferred voice
3. Use as `ELEVEN_LABS_VOICE_ID`

**Recommended Voices for Educational Content:**
- `pNInz6obpgDQGcFmaJgB` - Adam (Clear, professional)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (Warm, friendly)
- `AZnzlk1XvdvUeBnXmlld` - Domi (Clear, young adult)

### 4. Authentication Setup

The `BETTER_AUTH_SECRET` should be a cryptographically secure random string of at least 32 characters.

Generate one using:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

## Installation & Database Setup

```bash
# Install dependencies
npm install

# Generate database migrations
npm run db:generate

# Run database migrations (after setting up DATABASE_URL)
npm run db:migrate

# Seed database with sample data
npm run db:seed
```

## Development

```bash
# Start development server
npm run dev

# View database with Drizzle Studio
npm run db:studio
```

## Verification Steps

### 1. Database Connection
```bash
npm run db:studio
# Should open Drizzle Studio at http://localhost:4983
```

### 2. R2 Storage Test
Visit `/api/upload/presigned-url` (authenticated) to test R2 connection.

### 3. ElevenLabs TTS Test
Visit `/api/tts/voices` (authenticated) to test ElevenLabs connection.

### 4. Story Library Test
Visit `/api/stories` (authenticated) to see the story API.

### 5. Full Application Test
1. Start the development server: `npm run dev`
2. Visit `http://localhost:3000/login` for teacher/admin login
3. Visit `http://localhost:3000/student-login` for student visual login
4. Test story library, audio recording, and TTS generation

## Demo Accounts (After Seeding)

### Admin Account
- **Email**: admin@example.com
- **Password**: admin123
- **Role**: System administrator

### Teacher Account
- **Email**: sarah.johnson@example.com
- **Password**: teacher123
- **Role**: Teacher with class management

### Student Accounts
Students use visual authentication (no passwords):
- **Emma Wilson** - Animal password (orange cat)
- **Liam Brown** - Shape password (blue circle)
- **Olivia Davis** - Object password (red apple)

## File Structure Created

```
src/
├── lib/
│   ├── auth/              # BetterAuth configuration
│   ├── db/                # Database schema & migrations
│   ├── elevenlabs/        # TTS integration
│   └── storage/           # R2 storage client
├── components/
│   ├── auth/              # Authentication components
│   ├── audio/             # Audio recording components
│   ├── stories/           # Story library components
│   ├── providers/         # React context providers
│   └── ui/                # shadcn/ui components
└── app/
    ├── api/               # Next.js API routes
    │   ├── auth/          # Authentication endpoints
    │   ├── tts/           # TTS generation endpoints
    │   ├── upload/        # File upload endpoints
    │   └── stories/       # Story management endpoints
    ├── login/             # Teacher/admin login
    ├── student-login/     # Student visual login
    ├── student/
    │   ├── dashboard/     # Student dashboard
    │   └── practice/      # Reading practice interface
    └── teacher/
        └── dashboard/     # Teacher management dashboard
```

## Production Deployment

### Railway Deployment (Recommended)
1. Connect GitHub repository to Railway
2. Set all environment variables in Railway dashboard
3. Railway will auto-deploy on git push

### Vercel Deployment
1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard
3. Ensure DATABASE_URL points to production database

### Environment Variables for Production
- Use strong, unique secrets for production
- Use production database URL
- Use production R2 bucket
- Consider separate ElevenLabs account for production usage

## Troubleshooting

### Common Issues

#### Edge Runtime Errors ("Node.js 'crypto' module not supported")
This error occurs when Node.js APIs are used in Edge Runtime context. Our implementation fixes this by:
- Using simplified middleware that doesn't access the database
- Moving authentication logic to client-side components
- Configuring middleware for Node.js runtime when needed

If you see this error:
1. Ensure middleware is simplified (current version is fixed)
2. Check that database calls are only in API routes and server components
3. Avoid using Node.js APIs in middleware

#### Database Connection Errors
- Verify DATABASE_URL format: `postgresql://user:pass@host:port/dbname`
- Check database server is running
- Ensure database exists and user has permissions
- Database connection is established at module level, check console for connection errors

#### R2 Upload Failures
- Verify all R2 environment variables are set
- Check bucket exists and has public access enabled
- Ensure API token has correct permissions
- Test presigned URL generation in `/api/upload/presigned-url`

#### ElevenLabs API Errors
- Verify API key is valid
- Check account has remaining character quota
- Ensure voice ID exists (if specified)
- Monitor rate limits and usage

#### Authentication Issues
- Ensure BETTER_AUTH_SECRET is set and secure (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- Check BETTER_AUTH_URL matches your domain/port
- Authentication now handled client-side to avoid Edge Runtime issues
- Custom `useSession` hook implemented to work with BetterAuth client
- If server runs on different port, update `baseURL` in auth client
- Check browser console for authentication errors

## Security Notes

### Production Security Checklist
- [ ] Use strong, unique BETTER_AUTH_SECRET
- [ ] Rotate API keys regularly
- [ ] Enable HTTPS in production
- [ ] Set secure CORS policies
- [ ] Monitor R2 usage and costs
- [ ] Monitor ElevenLabs quota usage
- [ ] Regular database backups
- [ ] Enable audit logging

### File Upload Security
- File type validation enforced
- File size limits (50MB max)
- Presigned URLs with expiration
- User authentication required
- Role-based access control

## Cost Optimization

### R2 Storage
- Zero egress fees (unlike AWS S3)
- Pay only for storage used
- Use lifecycle policies for old files

### ElevenLabs
- One-time generation model (no per-play costs)
- Monitor character usage
- Use batch generation for efficiency
- Consider voice caching for repeated content

## Monitoring & Maintenance

### Regular Tasks
- Monitor ElevenLabs quota usage
- Check R2 storage usage and costs
- Review authentication logs
- Update dependencies
- Database maintenance and backups

### Performance Monitoring
- Audio loading times
- TTS generation times
- Database query performance
- API response times