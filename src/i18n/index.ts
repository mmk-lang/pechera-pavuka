// Переклади. Усі рядки інтерфейсу лежать у uk.json — тут лише функція, що їх дістає.
// Пізніше можна додати pl.json та en.json і перемикати мову.

import uk from './uk.json';

// t('problem.unknownCell', { id: 'part_1' }) → «part_1 посилається на неіснуючу клітинку»
export function t(key: string, params: Record<string, string | number> = {}): string {
  // Ідемо по ключу з крапками: 'problem.unknownCell' → uk.problem.unknownCell
  let value: unknown = uk;
  for (const part of key.split('.')) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof value !== 'string') return key; // рядка немає — показуємо ключ, щоб помилку було видно

  // Підставляємо {назва} → значення
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
