export interface SyncSkillOptions {
  version: string;
  destination?: string;
  fetchText?: (url: string) => Promise<string>;
}

export function syncSkill(options: SyncSkillOptions): Promise<string[]>;
