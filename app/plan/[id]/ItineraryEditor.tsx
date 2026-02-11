"use client";

import { useState, useMemo, type FormEvent } from "react";
import type { ItineraryItem } from "@/types/itinerary";
import { saveItineraryItems } from "./actions";
import { Button } from "@/app/ui/Button";
import { Card, CardBody } from "@/app/ui/Card";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

// NOTE: This component currently implements a "Location" text input.
// To fully enable Google Places Autocomplete:
// 1. Install 'use-places-autocomplete' or similar library.
// 2. Add your Google Maps API key to .env.local (NEXT_PUBLIC_GOOGLE_MAPS_KEY).
// 3. Replace the "Location" input signal with the autocomplete component.
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
  readOnly?: boolean;
  isAddPanelOpen?: boolean;
  onSetAddPanelOpen?: (isOpen: boolean) => void;
  onOpenCompass?: () => void;
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
  placeName: string;
};

// --- Subcomponent: SortableItem ---
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
  readOnly,
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
  readOnly?: boolean;
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
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
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
      (currentDraft.notes.trim() || "") !== (item.notes || "") ||
      (currentDraft.placeName.trim() || "") !== (item.place?.name || "")
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
      <div ref={setNodeRef} style={style} className="relative z-20">
        <Card className="border-blue-200 shadow-lg ring-2 ring-blue-100">
          <CardBody className="space-y-4 bg-white/50">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">Title</label>
              <input
                type="text"
                required
                value={currentDraft.title}
                onChange={(e) => onDraftChange({ ...currentDraft, title: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                placeholder="Visit the Louvre"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">Location</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={currentDraft.placeName}
                  onChange={(e) => onDraftChange({ ...currentDraft, placeName: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="Add a location..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Fixed Start Time</label>
                <input
                  type="text"
                  value={currentDraft.startTime}
                  onChange={(e) => onDraftChange({ ...currentDraft, startTime: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="HH:MM (Optional)"
                  pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Duration (min)</label>
                <input
                  type="number"
                  min="1"
                  value={currentDraft.durationMin}
                  onChange={(e) => onDraftChange({ ...currentDraft, durationMin: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                  placeholder="60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
              <textarea
                value={currentDraft.notes}
                onChange={(e) => onDraftChange({ ...currentDraft, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                placeholder="Notes..."
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
              <Button size="sm" onClick={() => onSave(block.item.id)} disabled={isSaving || !currentDraft.title.trim()}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group transition-all duration-200 ${isReorderMode ? 'cursor-grab active:cursor-grabbing hover:scale-[1.01]' : ''}`}
      {...(isReorderMode ? { ...attributes, ...listeners } : {})}
    >
      {/* Timeline connector line */}
      <div className="absolute left-6 top-16 bottom-0 w-px bg-zinc-100 -z-10 group-last:hidden" />

      <div className="flex gap-4">
        {/* Time Column */}
        <div className="w-12 pt-4 text-xs font-medium text-zinc-400 text-right shrink-0">
          {block.computedStartTime}
        </div>

        {/* Card */}
        <div className="flex-1 pb-6">
          <Card className="hover:border-zinc-300 transition-colors bg-white">
            <div className="p-4 flex items-start gap-4">
              {/* Reorder Handle Icon (Visible in Reorder Mode) */}
              {isReorderMode && (
                <div className="mt-1 text-zinc-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-zinc-900 truncate">{block.item.title}</h3>
                  {block.item.fixedStartTime && (
                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">Pinned</span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <span>{block.durationMin} min</span>
                  {block.item.place?.name && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-zinc-600">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {block.item.place.name}
                      </span>
                    </>
                  )}
                  {block.item.notes && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-[150px]">{block.item.notes}</span>
                    </>
                  )}
                </div>
                {block.item.mapsUrl && (
                  <>
                    <span>•</span>
                    <a
                      href={block.item.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      Open in Maps
                    </a>
                  </>
                )}
              </div>


              {/* Action Buttons (Hidden in Reorder Mode or ReadOnly) */}
              {!isReorderMode && !readOnly && (
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(block.item.id, block.item)}
                    className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button
                    onClick={() => onDelete(block.item.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---
export default function ItineraryEditor({
  planId,
  initialItems,
  planStartTime,
  planEndTime,
  readOnly = false,
  isAddPanelOpen,
  onSetAddPanelOpen,
  onOpenCompass,
}: ItineraryEditorProps) {
  const [items, setItems] = useState<ItineraryItem[]>(initialItems);
  const [internalShowAddPanel, setInternalShowAddPanel] = useState(false);

  // Use controlled state if provided, otherwise internal
  const showAddPanel = isAddPanelOpen !== undefined ? isAddPanelOpen : internalShowAddPanel;
  const setShowAddPanel = onSetAddPanelOpen || setInternalShowAddPanel;

  const [isSaving, setIsSaving] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderStartItems, setReorderStartItems] = useState<ItineraryItem[]>([]);
  const [newItem, setNewItem] = useState({
    title: "",
    fixedStartTime: "",
    durationMin: "",
    notes: "",
    placeName: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftItem | null>(null);

  // Compute schedule whenever items change
  const scheduledBlocks = useMemo(
    () => computeSchedule(items, planStartTime, planEndTime),
    [items, planStartTime, planEndTime]
  );

  // Effect: Handle external updates (e.g. from Compass generation)
  // When initialItems changes and is different from current items, we assume it's a new generation batch.
  // Note: stronger equality check or a specific "generationTimestamp" prop would be better, but this works for MVP.
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    // If we have new generated items, append them or replace?
    // The user requested "support a 'work around existing' mode: keep existing items and append AI items"
    // The parent 'generatedItems' are likely the *result* of the generation which might already include existing items
    // if the backend logic handled it.
    // Let's assume the parent passes the FULL desired list.
    setItems(initialItems);
    // Auto-save to persist the generated items
    saveItineraryItems(planId, initialItems).catch(err => console.error("Auto-save generated items failed:", err));
  }

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
    // Optimistic Update
    const previousItems = items;
    setItems(updatedItems);
    setIsSaving(true);

    try {
      await saveItineraryItems(planId, updatedItems);
      // Success definition might be needed if we want to update with server response
      // But for now we assume success
    } catch (error) {
      console.error("Failed to save itinerary:", error);
      alert(
        error instanceof Error
          ? `Failed to save itinerary: ${error.message}`
          : "Failed to save itinerary. Please try again."
      );
      // Revert on error
      setItems(previousItems);
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
      placeName: item.place?.name || "",
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
      durationMin: draft.durationMin.trim() ? parseInt(draft.durationMin, 10) : undefined,
      notes: draft.notes.trim() || undefined,
      place: draft.placeName.trim() ? { name: draft.placeName.trim() } : undefined,
    };

    if (updatedItem.fixedStartTime || !startTimeValue) {
      updatedItem.startTime = undefined;
    }

    const updatedItems = [...items];
    updatedItems[itemIndex] = updatedItem;

    await handleSave(updatedItems);
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
      durationMin: newItem.durationMin ? parseInt(newItem.durationMin, 10) : undefined,
      notes: newItem.notes.trim() || undefined,
      place: newItem.placeName.trim() ? { name: newItem.placeName.trim() } : undefined,
    };

    const updatedItems = [...items, item];
    await handleSave(updatedItems);

    setNewItem({ title: "", fixedStartTime: "", durationMin: "", notes: "", placeName: "" });
    setShowAddPanel(false);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
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
    setEditingId(null);
    setDraft(null);
    setReorderStartItems([...items]);
    setIsReorderMode(true);
  };

  const handleReorderDone = async () => {
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
    setItems([...reorderStartItems]);
    setIsReorderMode(false);
    setReorderStartItems([]);
  };

  const activityItems = scheduledBlocks.filter(
    (block): block is Extract<ScheduledBlock, { type: "activity" }> =>
      block.type === "activity"
  );

  return (
    <div className="w-full">
      {/* Controls Bar - Only show if not readOnly */}
      {!readOnly && (
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-zinc-500 font-medium">
            {items.length > 0 ? `${items.length} activities planned` : "Start adding activities"}
          </div>
          <div className="flex items-center gap-3">
            {/* Reorder/Edit Toggle */}
            {!showAddPanel && !editingId && items.length > 0 && (
              <Button
                variant={isReorderMode ? "primary" : "ghost"}
                size="sm"
                onClick={isReorderMode ? handleReorderDone : handleReorderStart}
                className={isReorderMode ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"}
                disabled={isSaving}
              >
                {isReorderMode ? "Done Reordering" : "Edit Order"}
              </Button>
            )}

            {/* Cancel Reorder */}
            {isReorderMode && (
              <Button variant="ghost" size="sm" onClick={handleReorderCancel} disabled={isSaving}>Cancel</Button>
            )}

            {/* Add Activity Button */}
            {!showAddPanel && !isReorderMode && !editingId && (
              <Button size="sm" onClick={() => setShowAddPanel(true)} className="flex items-center gap-1 bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm border border-zinc-900">
                <span className="text-lg leading-none mb-0.5">+</span> Add Activity
              </Button>
            )}
          </div>
        </div>
      )}

      {showAddPanel && (
        <div className="mb-8 animate-in slide-in-from-top-4">
          <Card className="border-blue-200 ring-4 ring-blue-50/50">
            <CardBody className="bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-zinc-900">New Activity</h3>
                <button onClick={() => setShowAddPanel(false)} className="text-zinc-400 hover:text-zinc-600">
                  <span className="sr-only">Close</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    placeholder="e.g. Breakfast at Café de Flore"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">Location</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={newItem.placeName}
                      onChange={(e) => setNewItem({ ...newItem, placeName: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      placeholder="Add a location..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Duration (min)</label>
                    <input
                      type="number"
                      min="1"
                      value={newItem.durationMin}
                      onChange={(e) => setNewItem({ ...newItem, durationMin: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 mb-1">Fixed Start Time (Optional)</label>
                    <input
                      type="text"
                      value={newItem.fixedStartTime}
                      onChange={(e) => setNewItem({ ...newItem, fixedStartTime: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900"
                      placeholder="HH:MM"
                      pattern="^([0-1][0-9]|2[0-3]):[0-5][0-9]$"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">Notes</label>
                  <textarea
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                    placeholder="Add details, links, or reminders..."
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setShowAddPanel(false)}>Cancel</Button>
                  <Button type="submit" disabled={!newItem.title.trim() || isSaving}>
                    {isSaving ? "Adding..." : "Add to Itinerary"}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="space-y-0 relative pl-4">
        {scheduledBlocks.length === 0 && !showAddPanel ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">Your day is empty</h3>
            <p className="text-sm text-zinc-500 mt-1 mb-6">Start with AI or build it manually.</p>

            <div className="flex flex-col gap-3 w-full max-w-xs transition-opacity duration-200">
              {onOpenCompass && (
                <Button onClick={onOpenCompass} className="w-full bg-[#1F2937] hover:bg-[#374151] text-white shadow-sm">
                  Generate with Compass
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowAddPanel(true)} className="w-full">
                Add activity manually
              </Button>
            </div>
          </div>
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
              <div className="space-y-0">
                {scheduledBlocks.map((block, index) => {
                  if (block.type === "gap") {
                    return (
                      <div key={`gap-${index}`} className="flex gap-4 group">
                        <div className="w-12 text-xs text-zinc-300 text-right pt-2 font-mono">
                          {/* Hidden time for gap start/end to keep alignment, or show small */}
                        </div>
                        <div className="relative flex-1 py-3 pl-8 border-l border-zinc-100 ml-6">
                          <div className="absolute left-[-5px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-zinc-100 border-2 border-white ring-1 ring-zinc-50" />
                          <div className="text-xs font-medium text-zinc-400 italic">
                            {block.durationMin} min gap ({block.startTime} - {block.endTime})
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
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div >
  );
}
