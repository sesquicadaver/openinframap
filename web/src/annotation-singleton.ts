import type { AnnotationEditor } from './annotation-editor.ts'

let _instance: AnnotationEditor | null = null

export function setAnnotationEditor(editor: AnnotationEditor): void {
  _instance = editor
}

export function getAnnotationEditor(): AnnotationEditor | null {
  return _instance
}
