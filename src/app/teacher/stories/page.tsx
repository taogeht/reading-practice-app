"use client";

import { useState } from "react";
import { StoryLibrary } from "@/components/stories/story-library";
import { CreateStoryDialog } from "@/components/stories/create-story-dialog";
import { Button } from "@/components/ui/button";

// Dedicated Stories destination — moved off the dashboard. Active stories by
// default; archived (not visible to students) behind a toggle.
export default function TeacherStoriesPage() {
  const [view, setView] = useState<"active" | "archived">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Stories</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your reading materials. Archived stories are hidden from students.
        </p>
      </div>

      <div className="mb-4 inline-flex rounded-lg border bg-white p-1">
        <Button
          variant={view === "active" ? "default" : "ghost"}
          size="sm"
          className="h-8"
          onClick={() => setView("active")}
        >
          Active
        </Button>
        <Button
          variant={view === "archived" ? "default" : "ghost"}
          size="sm"
          className="h-8"
          onClick={() => setView("archived")}
        >
          Archived
        </Button>
      </div>

      <StoryLibrary
        key={`${view}-${refreshKey}`}
        archivedOnly={view === "archived"}
        variant="grid"
        selectable={false}
        showCreateButton={view === "active"}
        onCreateStory={() => setShowCreate(true)}
      />

      <CreateStoryDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => {
          setShowCreate(false);
          setView("active");
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
