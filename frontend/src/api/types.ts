// Shared API response types for Studio 2.0

export interface RenderGroup {
  index: number;
  segment_ids: string[];
  engine: string;
  char_count: number;
}

export interface RenderGroupsResponse {
  count: number;
  groups: RenderGroup[];
}
