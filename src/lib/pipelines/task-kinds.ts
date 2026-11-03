import type { Deal, DealTask } from "@/types"

export const TASK_KINDS = [
  "ligacao",
  "tarefa",
  "email",
  "reuniao",
  "whatsapp",
  "visita",
] as const

export type TaskKind = (typeof TASK_KINDS)[number]

const KIND_MESSAGE: Record<string, string> = {
  ligacao: "kindLigacao",
  tarefa: "kindTask",
  email: "kindEmail",
  reuniao: "kindReuniao",
  whatsapp: "kindWhatsapp",
  visita: "kindVisita",
}

export function taskKindMessageKey(kind: string) {
  return (KIND_MESSAGE[kind] ?? "kindTask") as
    | "kindLigacao"
    | "kindTask"
    | "kindEmail"
    | "kindReuniao"
    | "kindWhatsapp"
    | "kindVisita"
}

type NamedProfile = {
  id: string
  full_name?: string | null
  email?: string | null
}

export function profileLabel(profile?: NamedProfile | null) {
  return profile?.full_name?.trim() || profile?.email?.trim() || ""
}

/** Seller of a call/task: the assignee, then the deal owner. */
export function taskSeller(
  task: DealTask & { deal?: (Pick<Deal, "assigned_to"> & { assignee?: NamedProfile | null }) | null },
  profiles: NamedProfile[] = [],
): { id: string; name: string } | null {
  const fromAssignee = task.assignee?.id ?? task.assignee_id
  if (fromAssignee) {
    const known = profiles.find((profile) => profile.id === fromAssignee)
    return {
      id: fromAssignee,
      name: profileLabel(task.assignee) || profileLabel(known),
    }
  }
  const fromDeal = task.deal?.assignee?.id ?? task.deal?.assigned_to
  if (!fromDeal) return null
  const known = profiles.find((profile) => profile.id === fromDeal)
  return {
    id: fromDeal,
    name: profileLabel(task.deal?.assignee) || profileLabel(known),
  }
}
