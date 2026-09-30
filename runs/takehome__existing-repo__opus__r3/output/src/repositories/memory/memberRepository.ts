import type { Member } from "../../domain/member.ts";
import type { MemberRepository } from "../types.ts";

export function createMemoryMemberRepository(): MemberRepository {
  const rows = new Map<string, Member>();

  return {
    insert(member) {
      rows.set(member.id, member);
    },
    findById(id) {
      return rows.get(id);
    },
    findByEmail(email) {
      for (const member of rows.values()) {
        if (member.email === email) return member;
      }
      return undefined;
    },
    findManyByIds(ids) {
      return ids.flatMap((id) => {
        const member = rows.get(id);
        return member ? [member] : [];
      });
    },
  };
}
