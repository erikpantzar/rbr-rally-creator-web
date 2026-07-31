// Persists country and surface filters across "add stage" sessions, so
// users don't have to re-select the same filters each time they add a new
// stage. Free-text name search is deliberately excluded (see StageConfigModal)
// as a remembered search term is more likely to produce a confusing empty list
// on reopen than to help.
const KEY = 'rbr.stagePickerFilters';

export function loadStagePickerFilters() {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveStagePickerFilters(filters) {
  localStorage.setItem(KEY, JSON.stringify(filters));
}
