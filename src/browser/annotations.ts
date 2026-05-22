// wisp-design — Structured annotations (Phase 2).
//
// We never PNG-flatten user input (Improvement #7 vs Impeccable). The popover
// is rendered inline by floating-bar.ts; this module provides:
//   - `createAnnotationCapture` standalone popover factory (used by callers
//     who need a detached annotation entry surface, e.g. tests)
//   - `annotationModule`            implements `AnnotationModule` contract

import { ANNOTATION_NOTE_MAX_LEN, WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import type {
  Annotation,
  AnnotationKind,
  AnnotationModule,
  SanitizeModule,
} from "../contracts/browser.js";

const KINDS: AnnotationKind[] = [
  "padding",
  "color",
  "size",
  "content",
  "spacing",
  "typography",
  "other",
];

// ---------------------------------------------------------------------------
// build / validate — pure logic for AnnotationModule.
// ---------------------------------------------------------------------------

export function buildAnnotation(
  targetId: string,
  kind: AnnotationKind,
  note: string,
): Annotation {
  return { targetId, kind, note };
}

export function validateAnnotation(
  a: Annotation,
): { ok: true } | { ok: false; reason: string } {
  if (typeof a.targetId !== "string" || a.targetId.length === 0) {
    return { ok: false, reason: "targetId is required" };
  }
  if (!KINDS.includes(a.kind)) {
    return { ok: false, reason: `kind must be one of ${KINDS.join("|")}` };
  }
  if (typeof a.note !== "string" || a.note.length === 0) {
    return { ok: false, reason: "note is required" };
  }
  if (a.note.length > ANNOTATION_NOTE_MAX_LEN) {
    return { ok: false, reason: `note exceeds ${ANNOTATION_NOTE_MAX_LEN}` };
  }
  return { ok: true };
}

export const annotationModule: AnnotationModule = {
  build: buildAnnotation,
  validate: validateAnnotation,
};

// ---------------------------------------------------------------------------
// createAnnotationCapture — detached popover (used by tests + extra UI).
// floating-bar's inline popover is the primary surface; this is the
// reusable factory for any other caller.
// ---------------------------------------------------------------------------

export interface AnnotationCaptureOptions {
  sanitize: SanitizeModule;
  onSubmit: (a: Annotation) => void;
}

export interface AnnotationCaptureHandle {
  open(targetId: string): void;
  close(): void;
  el: HTMLElement;
}

export function createAnnotationCapture(
  opts: AnnotationCaptureOptions,
): AnnotationCaptureHandle {
  const root = document.createElement("div");
  root.setAttribute(WISP_UI_DATA_ATTRIBUTE, "annotation-capture");
  root.style.display = "none";
  root.style.position = "fixed";
  root.style.zIndex = "2147483646";
  root.style.background = "#18181b";
  root.style.color = "#f4f4f5";
  root.style.padding = "8px";
  root.style.borderRadius = "8px";
  root.style.border = "1px solid #3f3f46";
  root.style.maxWidth = "320px";

  let currentTargetId = "";

  const kindSel = document.createElement("select");
  kindSel.setAttribute(WISP_UI_DATA_ATTRIBUTE, "annotation-kind");
  for (const k of KINDS) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    kindSel.appendChild(o);
  }
  root.appendChild(kindSel);

  const note = document.createElement("textarea");
  note.setAttribute(WISP_UI_DATA_ATTRIBUTE, "annotation-note");
  note.maxLength = ANNOTATION_NOTE_MAX_LEN;
  note.style.display = "block";
  note.style.width = "100%";
  note.style.margin = "6px 0";
  root.appendChild(note);

  const submit = document.createElement("button");
  submit.setAttribute(WISP_UI_DATA_ATTRIBUTE, "annotation-submit");
  submit.type = "button";
  submit.textContent = "Add annotation";
  submit.addEventListener("click", () => {
    const cleaned = opts.sanitize.sanitizeFreeText(note.value, {
      maxLen: ANNOTATION_NOTE_MAX_LEN,
    });
    if (cleaned.length === 0) return;
    const kind = kindSel.value as AnnotationKind;
    const annotation = buildAnnotation(currentTargetId, kind, cleaned);
    const v = validateAnnotation(annotation);
    if (!v.ok) return;
    opts.onSubmit(annotation);
    note.value = "";
    root.style.display = "none";
  });
  root.appendChild(submit);

  document.body.appendChild(root);

  return {
    el: root,
    open(targetId: string): void {
      currentTargetId = targetId;
      root.style.display = "block";
      note.focus();
    },
    close(): void {
      root.style.display = "none";
    },
  };
}
