export interface DealFilterState {
  withoutTask: boolean;
  name: string;
  valueMin: string;
  valueMax: string;
  createdFrom: string;
  closeFrom: string;
  nextTaskFrom: string;
}

export const EMPTY_DEAL_FILTERS: DealFilterState = {
  withoutTask: false,
  name: "",
  valueMin: "",
  valueMax: "",
  createdFrom: "",
  closeFrom: "",
  nextTaskFrom: "",
};

export function countActiveFilters(filters: DealFilterState): number {
  let n = 0;
  if (filters.withoutTask) n += 1;
  if (filters.name.trim()) n += 1;
  if (filters.valueMin || filters.valueMax) n += 1;
  if (filters.createdFrom) n += 1;
  if (filters.closeFrom) n += 1;
  if (filters.nextTaskFrom) n += 1;
  return n;
}
