import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StarsProvider } from "@/components/providers/stars-provider";
import { AvatarProvider } from "@/components/providers/avatar-provider";

// Mounts the gamification contexts (stars + avatar) for every /student/* route.
// We deliberately don't render the StudentLayoutShell chrome here because the
// /student/dashboard page renders its own inline header (welcome banner, avatar
// chooser, logout). Wrapping with the shell would double-stack the nav. The
// providers alone are enough — useStars()/useAvatar() now resolve to the live
// context instead of the no-op fallback that swallowed setAvatar/refresh calls
// and left the picker stuck onscreen after creating an avatar.
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
            <AvatarProvider>{children}</AvatarProvider>
        </StarsProvider>
    );
}
