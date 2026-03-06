"use client";

import { useState, useCallback, ReactNode } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface SortableCardProps {
    id: string;
    children: ReactNode;
}

function SortableCard({ id, children }: SortableCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
        position: "relative" as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : ""}>
            <div className="group relative">
                {/* Drag handle */}
                <div
                    {...attributes}
                    {...listeners}
                    className="absolute -left-3 top-4 z-10 cursor-grab active:cursor-grabbing p-1.5 rounded-md bg-white border border-gray-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
                    title="Drag to reorder"
                >
                    <GripVertical className="w-4 h-4 text-gray-400" />
                </div>
                {children}
            </div>
        </div>
    );
}

interface SortableCardListProps {
    /** Unique key for localStorage persistence, e.g. "class-dashboard-{classId}" */
    storageKey: string;
    /** Map of card IDs to their React nodes */
    cards: { id: string; node: ReactNode }[];
}

export function SortableCardList({ storageKey, cards }: SortableCardListProps) {
    const defaultOrder = cards.map((c) => c.id);

    const [order, setOrder] = useState<string[]>(() => {
        if (typeof window === "undefined") return defaultOrder;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed: string[] = JSON.parse(saved);
                // Validate saved order: must contain all current IDs
                const currentIds = new Set(defaultOrder);
                const savedIds = new Set(parsed);
                const allPresent = defaultOrder.every((id) => savedIds.has(id));
                if (allPresent) {
                    // Add any new cards that weren't in saved order
                    const extra = defaultOrder.filter((id) => !savedIds.has(id));
                    return [...parsed.filter((id) => currentIds.has(id)), ...extra];
                }
            }
        } catch {
            // Ignore parse errors
        }
        return defaultOrder;
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
                setOrder((prev) => {
                    const oldIndex = prev.indexOf(active.id as string);
                    const newIndex = prev.indexOf(over.id as string);
                    const newOrder = arrayMove(prev, oldIndex, newIndex);
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(newOrder));
                    } catch {
                        // Ignore storage errors
                    }
                    return newOrder;
                });
            }
        },
        [storageKey]
    );

    // Build a lookup map
    const cardMap = new Map(cards.map((c) => [c.id, c.node]));

    // Sort cards according to current order
    const sortedCards = order
        .filter((id) => cardMap.has(id))
        .map((id) => ({ id, node: cardMap.get(id)! }));

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
                <div className="space-y-6">
                    {sortedCards.map(({ id, node }) => (
                        <SortableCard key={id} id={id}>
                            {node}
                        </SortableCard>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}
