-- Enhanced Reading Practice Platform Database Schema
-- Version 1.0

-- Enumeration types
CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');
CREATE TYPE assignment_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE recording_status AS ENUM ('pending', 'submitted', 'reviewed', 'flagged');
CREATE TYPE visual_password_type AS ENUM ('color_shape', 'animal', 'object');

-- Core users table with role-based architecture
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE, -- nullable for students
    password_hash VARCHAR(255), -- nullable for students (visual auth)
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Schools/Districts table
CREATE TABLE schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    district VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- School membership for users
CREATE TABLE school_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, school_id)
);

-- Student-specific data (extends users)
CREATE TABLE students (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    grade_level INTEGER CHECK (grade_level >= 0 AND grade_level <= 12),
    avatar_url VARCHAR(500),
    visual_password_type visual_password_type,
    visual_password_data JSONB, -- stores the visual password configuration
    parent_email VARCHAR(255),
    reading_level VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teacher-specific data (extends users)
CREATE TABLE teachers (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(100),
    department VARCHAR(100),
    subjects TEXT[], -- array of subjects they teach
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stories library
CREATE TABLE stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    reading_level VARCHAR(50),
    grade_levels INTEGER[] DEFAULT '{}', -- array of applicable grade levels
    word_count INTEGER,
    estimated_reading_time_minutes INTEGER,
    author VARCHAR(255),
    genre VARCHAR(100),
    tts_audio_url VARCHAR(500), -- Cloudflare R2 URL
    tts_audio_duration_seconds INTEGER,
    tts_generated_at TIMESTAMP WITH TIME ZONE,
    eleven_labs_voice_id VARCHAR(100),
    active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for story searches
CREATE INDEX idx_stories_reading_level ON stories(reading_level);
CREATE INDEX idx_stories_grade_levels ON stories USING GIN(grade_levels);
CREATE INDEX idx_stories_active ON stories(active);

-- Classes/Groups
CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    grade_level INTEGER,
    academic_year VARCHAR(20), -- e.g., "2024-2025"
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Class enrollment
CREATE TABLE class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(class_id, student_id)
);

-- Assignments
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    status assignment_status DEFAULT 'draft',
    assigned_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE,
    max_attempts INTEGER DEFAULT 3,
    instructions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for assignment queries
CREATE INDEX idx_assignments_class_id ON assignments(class_id);
CREATE INDEX idx_assignments_teacher_id ON assignments(teacher_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_due_at ON assignments(due_at);

-- Student recordings and submissions
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    audio_url VARCHAR(500) NOT NULL, -- Cloudflare R2 URL
    audio_duration_seconds INTEGER,
    file_size_bytes BIGINT,
    attempt_number INTEGER DEFAULT 1,
    status recording_status DEFAULT 'pending',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES teachers(id),
    teacher_feedback TEXT,
    automated_flags JSONB, -- stores any automated analysis flags
    wpm_score DECIMAL(5,2), -- words per minute if calculated
    accuracy_score DECIMAL(5,2), -- percentage accuracy if calculated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure one recording per attempt per assignment per student
CREATE UNIQUE INDEX idx_recordings_unique_attempt 
ON recordings(assignment_id, student_id, attempt_number);

-- Index for performance queries
CREATE INDEX idx_recordings_student_id ON recordings(student_id);
CREATE INDEX idx_recordings_assignment_id ON recordings(assignment_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_recordings_submitted_at ON recordings(submitted_at);

-- Progress tracking and analytics
CREATE TABLE student_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    best_wpm_score DECIMAL(5,2),
    best_accuracy_score DECIMAL(5,2),
    total_attempts INTEGER DEFAULT 0,
    time_spent_minutes INTEGER DEFAULT 0,
    flagged_for_review BOOLEAN DEFAULT false,
    teacher_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, assignment_id)
);

-- System configuration and settings
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('max_recording_duration_seconds', '300', 'Maximum recording length in seconds'),
('max_file_size_mb', '50', 'Maximum audio file size in megabytes'),
('supported_audio_formats', '["mp3", "wav", "m4a", "ogg"]', 'Supported audio file formats'),
('auto_flag_low_wpm_threshold', '50', 'WPM threshold below which students are flagged'),
('auto_flag_low_accuracy_threshold', '70', 'Accuracy percentage below which students are flagged'),
('eleven_labs_voice_settings', '{"voice_id": "default", "stability": 0.5, "similarity_boost": 0.75}', 'ElevenLabs TTS voice configuration');

-- Audit log for important system events
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for audit log queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to tables with updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stories_updated_at BEFORE UPDATE ON stories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recordings_updated_at BEFORE UPDATE ON recordings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_progress_updated_at BEFORE UPDATE ON student_progress 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries

-- Student dashboard view
CREATE VIEW student_dashboard AS
SELECT 
    s.id as student_id,
    s.first_name,
    s.last_name,
    s.avatar_url,
    a.id as assignment_id,
    a.title as assignment_title,
    a.due_at,
    st.title as story_title,
    sp.completed_at,
    sp.total_attempts,
    sp.best_wpm_score,
    sp.best_accuracy_score,
    CASE 
        WHEN sp.completed_at IS NOT NULL THEN 'completed'
        WHEN a.due_at < NOW() THEN 'overdue'
        ELSE 'pending'
    END as assignment_status
FROM users s
JOIN students st_data ON s.id = st_data.id
JOIN class_enrollments ce ON s.id = ce.student_id
JOIN assignments a ON ce.class_id = a.class_id
JOIN stories st ON a.story_id = st.id
LEFT JOIN student_progress sp ON s.id = sp.student_id AND a.id = sp.assignment_id
WHERE s.role = 'student' AND s.active = true;

-- Teacher class overview
CREATE VIEW teacher_class_overview AS
SELECT 
    t.id as teacher_id,
    c.id as class_id,
    c.name as class_name,
    COUNT(DISTINCT ce.student_id) as total_students,
    COUNT(DISTINCT a.id) as total_assignments,
    COUNT(DISTINCT CASE WHEN sp.completed_at IS NOT NULL THEN sp.id END) as completed_assignments,
    COUNT(DISTINCT CASE WHEN sp.flagged_for_review THEN sp.id END) as flagged_submissions
FROM users t
JOIN teachers t_data ON t.id = t_data.id
JOIN classes c ON t.id = c.teacher_id
LEFT JOIN class_enrollments ce ON c.id = ce.class_id
LEFT JOIN assignments a ON c.id = a.class_id
LEFT JOIN student_progress sp ON a.id = sp.assignment_id
WHERE t.role = 'teacher' AND c.active = true
GROUP BY t.id, c.id, c.name;

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user accounts for all platform users (students, teachers, admins)';
COMMENT ON TABLE schools IS 'Educational institutions using the platform';
COMMENT ON TABLE students IS 'Extended student profile data with visual authentication';
COMMENT ON TABLE teachers IS 'Extended teacher profile data';
COMMENT ON TABLE stories IS 'Reading content library with TTS audio files';
COMMENT ON TABLE assignments IS 'Reading assignments created by teachers';
COMMENT ON TABLE recordings IS 'Student audio recordings and submissions';
COMMENT ON TABLE student_progress IS 'Aggregated student progress and analytics data';
COMMENT ON TABLE system_settings IS 'Configurable system parameters';
COMMENT ON TABLE audit_logs IS 'Security and activity audit trail';