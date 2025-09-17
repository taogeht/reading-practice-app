"use client";

import dynamic from 'next/dynamic'

const StudentDashboardV2 = dynamic(() => import('./client-page'), { ssr: false })

export default function DashboardLoader() {
  return <StudentDashboardV2 />
}
