// Back-compat shim. The reading-content capability is now part of the unified
// per-teacher capability model in ./teacher-capabilities. This module re-exports
// the relevant pieces so the already-wired /teacher/reading/** routes keep their
// import path. Prefer importing from ./teacher-capabilities in new code.
export {
  canGenerateReadingContent,
  getTeacherCapabilities,
  teacherCan,
  type TeacherCapabilities,
  type TeacherCapability,
} from './teacher-capabilities';
