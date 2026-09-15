import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StarsProvider } from "@/components/providers/stars-provider";
import { AvatarProvider } from "@/components/providers/avatar-provider";
import { StudentActivityProvider } from "@/components/providers/student-activity-provider";

// Mounts the gamification contexts (stars + avatar) and global activity/time
// tracker for every /student/* route.
export default async function StudentRouteLayout({
    children,
}: {
    children: ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/student-login");
    if (user.role !== "student") redirect("/unauthorized");

    return (
        <StarsProvider>
            <AvatarProvider>
                <StudentActivityProvider>{children}</StudentActivityProvider>
            </AvatarProvider>
        </StarsProvider>
    );
}
