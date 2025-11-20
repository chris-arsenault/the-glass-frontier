import {ChronicleBeat, LocationBreadcrumbEntry, Skill} from "@glass-frontier/dto";

export function trimSkillsList(skills: Skill[]) {
  return skills.map(s => { return {
      name: s.name,
      tier: s.tier,
    }})
}

export function trimBeatsList(beats: ChronicleBeat[]) {
  return beats
    .filter(b => { return b.status == 'in_progress' })
    .map(b => { return {
      id: b.id,
      title: b.title,
      description: b.description,
      status: b.status,
  }})
}

export function trimBreadcrumbList(crumbs: LocationBreadcrumbEntry[]) {
  return crumbs.map(b => { return {
    name: b.name,
    kind: b.kind,
  }})
}