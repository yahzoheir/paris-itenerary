"use client";

import { useState, useMemo, type FormEvent } from "react";
import type { ItineraryItem } from "@/types/itinerary";
// import { supabase } from "@/app/lib/supabaseClient"; // Removed - using Server Action
import { saveItineraryItems } from "./actions";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ItineraryEditorProps {
  planId: string;
  initialItems: ItineraryItem[];
  planStartTime: string | null;
  planEndTime: string | null;
}

type ScheduledBlock =
  | {
    type: "activity";
    item: ItineraryItem;
    computedStartTime: string;
    computedEndTime: string;
    durationMin: number;
  }
  | {
    type: "gap";
    startTime: string;
    endTime: string;
    durationMin: number;
  };

// Convert "HH:MM" to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Convert minutes since midnight to "HH:MM"
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function computeSchedule(
  items: ItineraryItem[],
  planStartTime: string | null,
  planEndTime: string | null,
  defaultDurationMin = 60
): ScheduledBlock[] {
  if (items.length === 0) return [];

  const startTime = planStartTime || "09:00";
  let currentCursor = timeToMinutes(startTime);
  const blocks: ScheduledBlock[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const duration = item.durationMin || defaultDurationMin;

    // Get fixed start time (prefer fixedStartTime, fallback to startTime for backward compat)
    const fixedStart = item.fixedStartTime || item.startTime;

    let itemStart: number;

    if (fixedStart) {
      const fixedStartMinutes = timeToMinutes(fixedStart);
      // If fixed time is before cursor, push cursor forward to fixed time
      // If fixed time is after cursor, use fixed time and update cursor
      if (fixedStartMinutes < currentCursor) {
        // Fixed item starts before cursor - shift it to cursor (no overlap)
        itemStart = currentCursor;
      } else {
        // Fixed item starts after cursor - use fixed time
        itemStart = fixedStartMinutes;
        currentCursor = fixedStartMinutes;
      }
    } else {
      // No fixed time - use current cursor
      itemStart = currentCursor;
    }

    const itemEnd = itemStart + duration;

    // Check for gap before this item
    if (i > 0 && itemStart > currentCursor) {
      const gapDuration = itemStart - currentCursor;
      blocks.push({
        type: "gap",
        startTime: minutesToTime(currentCursor),
        endTime: minutesToTime(itemStart),
        durationMin: gapDuration,
      });
    }

    // Add activity block
    blocks.push({
      type: "activity",
      item,
      computedStartTime: minutesToTime(itemStart),
      computedEndTime: minutesToTime(itemEnd),
      durationMin: duration,
    });

    // Update cursor to end of this item
    currentCursor = itemEnd;
  }

  return blocks;
}

type DraftItem = {
  title: string;
  startTime: string;
  durationMin: string;
  notes: string;
};

function SortableItem({
  block,
  isReorderMode,
  onDelete,
  isSaving,
  editingId,
  draft,
  onEdit,
  onSave,
  onCancel,
  onDraftChange,
}: {
  block: Extract<ScheduledBlock, { type: "activity" }>;
  isReorderMode: boolean;
  onDelete: (id: string) => void;
  isSaving: boolean;
  editingId: string | null;
  draft: DraftItem | null;
  onEdit: (id: string, item: ItineraryItem) => void;
  onSave: (id: string) => void;
  onCancel: (id: string) => void;
  onDraftChange: (updates: Partial<DraftItem>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isEditing = editingId === block.item.id;
  const currentDraft = isEditing ? draft : null;

  // Helper to check if draft has changes
  const isDirty = (): boolean => {
    if (!currentDraft) return false;
    const item = block.item;
    return (
      currentDraft.title.trim() !== item.title ||
      (currentDraft.startTime.trim() || "") !== (item.fixedStartTime || item.startTime || "") ||
      (currentDraft.durationMin.trim() || "") !== (item.durationMin?.toString() || "") ||
      (currentDraft.notes.trim() || "") !== (item.notes || "")
    );
  };

  const handleCancel = () => {
    if (isDirty()) {
      if (window.confirm("Discard changes?")) {
        onCancel(block.item.id);
      }
    } else {
      onCancel(block.item.id);
    }
  };

  if (isEditing && currentDraft) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border border-gray-300 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor={`edit-title-${block.item.id}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Title *
            </label>
            <input
              type="text"
              id={`edit-title-${block.item.id}`}
              required
              value={currentDraft.title}
              onChange={(e) =>
                onDraftChange({ ...currentDraft, title: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter title"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-startTime-${block.item.id}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Start time (HH:MM)
            </label>
            <input
              type="text"
              id={`edit-startTime-${block.item.id}`}
              value={currentDraft.startTime}
              onChange={(e) =>
                onDraftChange({ ...currentDraft, startTime: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="09:00 (optional)"
              pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-durationMin-${block.item.id}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Duration (minutes)
            </label>
            <input
              type="number"
              id={`edit-durationMin-${block.item.id}`}
              min="1"
              value={currentDraft.durationMin}
              onChange={(e) =>
                onDraftChange({ ...currentDraft, durationMin: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="60"
            />
          </div>

          <div>
            <label
              htmlFor={`edit-notes-${block.item.id}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Notes
            </label>
            <textarea
              id={`edit-notes-${block.item.id}`}
              value={currentDraft.notes}
              onChange={(e) =>
                onDraftChange({ ...currentDraft, notes: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Optional notes"
            />
          </div>

          <p className="text-xs text-gray-500 italic">
            Changes won't be saved unless you tap Save.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => onSave(block.item.id)}
              disabled={isSaving || !currentDraft.title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-gray-300 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        {isReorderMode && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600"
            aria-label="Drag handle"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8h16M4 16h16"
              />
            </svg>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900">{block.item.title}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {block.computedStartTime} – {block.computedEndTime}
            {block.item.fixedStartTime && (
              <span className="ml-2 text-xs text-blue-600">(pinned)</span>
            )}
          </p>
          {block.item.notes && (
            <p className="text-sm text-gray-500 mt-1">{block.item.notes}</p>
          )}
        </div>
        {!isReorderMode && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onEdit(block.item.id, block.item)}
              disabled={isSaving}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Edit item"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(block.item.id)}
              disabled={isSaving}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Delete item"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ItineraryEditor({
  planId,
  initialItems,
  planStartTime,
  planEndTime,
}: ItineraryEditorProps) {
  const [items, setItems] = useState<ItineraryItem[]>(initialItems);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderStartItems, setReorderStartItems] = useState<ItineraryItem[]>(
    []
  );
  const [newItem, setNewItem] = useState({
    title: "",
    fixedStartTime: "",
    durationMin: "",
    notes: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem | null>(null);

  // Compute schedule whenever items change
  const scheduledBlocks = useMemo(
    () => computeSchedule(items, planStartTime, planEndTime),
    [items, planStartTime, planEndTime]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );



  const handleSave = async (updatedItems: ItineraryItem[]) => {
    setIsSaving(true);
    try {
      await saveItineraryItems(planId, updatedItems);

      setItems(updatedItems);
    } catch (error) {
      console.error("Failed to save itinerary:", error);
      alert(
        error instanceof Error
          ? `Failed to save itinerary: ${error.message}`
          : "Failed to save itinerary. Please try again."
      );
    } finally {
      setIsSaving(false);
    }

  };

  const handleEditStart = (id: string, item: ItineraryItem) => {
    setEditingId(id);
    setDraft({
      title: item.title,
      startTime: item.fixedStartTime || item.startTime || "",
      durationMin: item.durationMin?.toString() || "",
      notes: item.notes || "",
    });
  };

  const handleEditCancel = (id: string) => {
    setEditingId(null);
    setDraft(null);
  };

  const handleEditSave = async (id: string) => {
    if (!draft || !draft.title.trim()) return;

    const itemIndex = items.findIndex((item) => item.id === id);
    if (itemIndex === -1) return;

    const originalItem = items[itemIndex];
    const startTimeValue = draft.startTime.trim();
    const updatedItem: ItineraryItem = {
      ...originalItem,
      title: draft.title.trim(),
      fixedStartTime: startTimeValue || undefined,
      durationMin: draft.durationMin.trim()
        ? parseInt(draft.durationMin, 10)
        : undefined,
      notes: draft.notes.trim() || undefined,
    };

    // Clear startTime (legacy field) when we have fixedStartTime or when clearing
    if (updatedItem.fixedStartTime || !startTimeValue) {
      updatedItem.startTime = undefined;
    }

    const updatedItems = [...items];
    updatedItems[itemIndex] = updatedItem;

    await handleSave(updatedItems);

    // Close editor after successful save
    setEditingId(null);
    setDraft(null);
  };

  const handleDraftChange = (updates: Partial<DraftItem>) => {
    if (draft) {
      setDraft({ ...draft, ...updates });
    }
  };

  const handleAddItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newItem.title.trim()) return;

    const item: ItineraryItem = {
      id: crypto.randomUUID(),
      title: newItem.title.trim(),
      fixedStartTime: newItem.fixedStartTime.trim() || undefined,
      durationMin: newItem.durationMin
        ? parseInt(newItem.durationMin, 10)
        : undefined,
      notes: newItem.notes.trim() || undefined,
    };

    const updatedItems = [...items, item];
    await handleSave(updatedItems);

    // Reset form
    setNewItem({ title: "", fixedStartTime: "", durationMin: "", notes: "" });
    setShowAddPanel(false);
  };

  const handleDeleteItem = async (itemId: string) => {
    const updatedItems = items.filter((item) => item.id !== itemId);
    await handleSave(updatedItems);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleReorderStart = () => {
    // Close any active editing
    setEditingId(null);
    setDraft(null);
    setReorderStartItems([...items]);
    setIsReorderMode(true);
  };

  const handleReorderDone = async () => {
    // Check if order actually changed
    const orderChanged =
      items.length !== reorderStartItems.length ||
      items.some((item, index) => item.id !== reorderStartItems[index]?.id);

    if (orderChanged) {
      await handleSave(items);
    }

    setIsReorderMode(false);
    setReorderStartItems([]);
  };

  const handleReorderCancel = () => {
    // Restore original order
    setItems([...reorderStartItems]);
    setIsReorderMode(false);
    setReorderStartItems([]);
  };

  // Get activity items for sortable context (exclude gaps)
  const activityItems = scheduledBlocks.filter(
    (block): block is Extract<ScheduledBlock, { type: "activity" }> =>
      block.type === "activity"
  );

  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Itinerary</h2>
        <div className="flex gap-2">
          {!showAddPanel && !isReorderMode && !editingId && items.length > 0 && (
            <button
              onClick={handleReorderStart}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
            >
              Reorder
            </button>
          )}
          {!showAddPanel && !isReorderMode && !editingId && (
            <button
              onClick={() => {
                // Close any active editing
                setEditingId(null);
                setDraft(null);
                setShowAddPanel(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Add item
            </button>
          )}
          {isReorderMode && (
            <>
              <button
                onClick={handleReorderDone}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSaving ? "Saving..." : "Done"}
              </button>
              <button
                onClick={handleReorderCancel}
                disabled={isSaving}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {showAddPanel && (
        <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
          <form onSubmit={handleAddItem} className="space-y-3">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Title *
              </label>
              <input
                type="text"
                id="title"
                required
                value={newItem.title}
                onChange={(e) =>
                  setNewItem({ ...newItem, title: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter title"
              />
            </div>

            <div>
              <label
                htmlFor="fixedStartTime"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Pinned start time (HH:MM)
              </label>
              <input
                type="text"
                id="fixedStartTime"
                value={newItem.fixedStartTime}
                onChange={(e) =>
                  setNewItem({ ...newItem, fixedStartTime: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="09:00 (optional)"
                pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to auto-assign from plan start time
              </p>
            </div>

            <div>
              <label
                htmlFor="durationMin"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Duration (minutes)
              </label>
              <input
                type="number"
                id="durationMin"
                min="1"
                value={newItem.durationMin}
                onChange={(e) =>
                  setNewItem({ ...newItem, durationMin: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="60"
              />
              <p className="mt-1 text-xs text-gray-500">
                Default: 60 minutes if empty
              </p>
            </div>

            <div>
              <label
                htmlFor="notes"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Notes
              </label>
              <textarea
                id="notes"
                value={newItem.notes}
                onChange={(e) =>
                  setNewItem({ ...newItem, notes: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Optional notes"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving || !newItem.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddPanel(false);
                  setNewItem({
                    title: "",
                    fixedStartTime: "",
                    durationMin: "",
                    notes: "",
                  });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {scheduledBlocks.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No items yet. Click "Add item" to get started.
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={activityItems.map((block) => block.item.id)}
              strategy={verticalListSortingStrategy}
            >
              {scheduledBlocks.map((block, index) => {
                if (block.type === "gap") {
                  return (
                    <div
                      key={`gap-${index}`}
                      className="border border-gray-200 rounded-lg p-3 bg-gray-50 opacity-75"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            Gap
                          </span>
                          <p className="text-sm text-gray-600 mt-1">
                            {block.startTime} – {block.endTime} ({block.durationMin} min)
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <SortableItem
                    key={block.item.id}
                    block={block}
                    isReorderMode={isReorderMode}
                    onDelete={handleDeleteItem}
                    isSaving={isSaving}
                    editingId={editingId}
                    draft={draft}
                    onEdit={handleEditStart}
                    onSave={handleEditSave}
                    onCancel={handleEditCancel}
                    onDraftChange={handleDraftChange}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
