"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Smile } from "lucide-react";

interface AvatarOption {
  id: string;
  emoji: string;
  name: string;
}

interface AvatarPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatars: AvatarOption[];
  selectedAvatar?: string | null;
  onSelect: (emoji: string) => void;
  loading?: boolean;
}

export function AvatarPickerDialog({
  open,
  onOpenChange,
  avatars,
  selectedAvatar,
  onSelect,
  loading = false,
}: AvatarPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smile className="w-5 h-5 text-blue-600" />
            Choose Your Avatar
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {avatars.map((avatar) => {
            const isSelected = avatar.emoji === selectedAvatar;
            return (
              <Button
                key={avatar.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                className={cn(
                  "h-20 flex flex-col items-center justify-center",
                  isSelected && "border-blue-600"
                )}
                onClick={() => onSelect(avatar.emoji)}
                disabled={loading}
              >
                <span className="text-3xl" aria-hidden>
                  {avatar.emoji}
                </span>
                <span className="sr-only">{avatar.name}</span>
                {isSelected && <Check className="w-4 h-4" />}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
